import datetime
import math

from dateutil import parser
from girder import events
from girder.constants import SortDir
from girder.exceptions import ValidationException
from girder.models.model_base import Model

from dive_utils.metadata.numeric import (
    categorical_values_for_schema,
    is_nonfinite_numeric_placeholder,
    merge_numeric_sample_into_range_dict,
)


class DIVE_Metadata(Model):
    # This is NOT an access controlled model; it is expected that all endpoints
    # will be sensibly guarded instead.
    def __init__(self):
        # Do the bindings before calling __init__(), in case a derived class
        # wants to change things in initialize()
        events.bind('model.folder.remove', 'removeImport', self._cleanupDeletedEntity)
        super().__init__()

    def _cleanupDeletedEntity(self, event):
        # remove data if the folderId matches
        entityDoc = event.info
        folderId = entityDoc['_id']
        dive_dataset = self.findOne({'DIVEDataset': str(folderId)})
        if dive_dataset is not None:
            self.remove(dive_dataset)

    def initialize(self):
        self.name = 'DIVE_Metadata'
        self.ensureIndices(
            [
                'root',
                'DIVEDataset',
                (
                    [
                        ('created', SortDir.ASCENDING),
                    ],
                    {},
                ),
            ]
        )

    def createMetadata(
        self,
        folder,
        root,
        owner,
        metadata,
        created_date=None,
        replace=True,
    ):  # noqa: B006
        existing = self.findOne({'DIVEDataset': str(folder['_id']), 'root': str(root['_id'])})
        if existing and not replace:
            return existing
        if not existing:
            if created_date is None:
                created = datetime.datetime.utcnow()
            else:
                created = parser.parse(created_date)

            existing = dict(
                DIVEDataset=str(folder['_id']),
                filename=str(folder['name']),
                root=str(root['_id']),
                metadata=metadata,
                created=created,
                owner=str(owner['_id']),
            )
        else:
            existing['metadata'] = metadata
            existing['filename'] = str(folder['name'])
            existing['root'] = str(root['_id'])
            existing['owner'] = str(owner['_id'])
        existing = self.save(existing)
        return existing

    def validate(self, doc):
        if not doc.get('DIVEDataset') or not isinstance(doc['DIVEDataset'], str):
            raise ValidationException('DIVEDataset must be a string')
        if 'root' not in doc or not isinstance(doc['root'], str):
            raise ValidationException('root must be a string')
        return doc

    def updateKey(self, folder, root, owner, key, value, categoricalLimit=50, force=False):
        # root is the DIVE metadata *collection* folder id (string); folder is the dataset Girder folder.
        root_id = str(root)
        existing = self.findOne({'DIVEDataset': str(folder['_id']), 'root': root_id})
        if not existing:
            raise Exception(
                f'No DIVE_Metadata row for datasetId={folder["_id"]} and metadataRoot={root_id}'
            )
        query = {'root': root_id}
        metadataKeys = DIVE_MetadataKeys().findOne(
            query=query,
        )
        if not metadataKeys:
            raise Exception(
                f'No DIVE_MetadataKeys document for metadataRoot={root_id} '
                f'(request was for datasetId={folder["_id"]})'
            )
        if (
            key not in metadataKeys['unlocked'] and metadataKeys['owner'] != str(owner['_id'])
        ) and force is False:
            raise Exception(f'Key {key} is not unlocked for this metadata and cannot be modified')
        if metadataKeys['metadataKeys'].get(key, None) is None:
            all_keys = list(metadataKeys['metadataKeys'].keys())
            editable_keys = [
                key
                for key in all_keys
                if key
                not in [
                    'LastModifiedTime',
                    'LastModifiedBy',
                    'DIVEDataset',
                    'filename',
                    'DIVE_Path',
                ]
                and not key.startswith('DIVE_')
                and not key.startswith('ffprobe')
            ]
            if not editable_keys:
                raise Exception('No editable keys in the metadata to update')

            raise Exception(
                f'Key: {key} is not in the metadata only keys: {editable_keys} can be updated'
            )
        cat = metadataKeys['metadataKeys'][key]['category']
        finite_num = None
        non_num_stored = None
        if cat == 'numerical':
            try:
                fv = float(value)
            except (TypeError, ValueError):
                fv = float('nan')
            # Sparse CSV cells become NaN — never persist (breaks Girder JSON on filter/metadata APIs).
            if math.isfinite(fv):
                existing['metadata'][key] = fv
                finite_num = fv
            else:
                existing['metadata'][key] = None
        else:
            non_num_stored = value
            if is_nonfinite_numeric_placeholder(non_num_stored):
                non_num_stored = None
            existing['metadata'][key] = non_num_stored
        self.save(existing)
        # now we need to update the metadataKey aggregate (skip non-finite numericals)
        if cat == 'numerical' and finite_num is not None:
            DIVE_MetadataKeys().updateKeyValue(existing['root'], owner, key, finite_num, categoricalLimit)
        elif cat != 'numerical' and non_num_stored is not None:
            DIVE_MetadataKeys().updateKeyValue(existing['root'], owner, key, non_num_stored, categoricalLimit)

    def deleteKey(self, folder, root, owner, key):
        root_id = str(root)
        existing = self.findOne({'DIVEDataset': str(folder['_id']), 'root': root_id})
        if not existing:
            return
        query = {'root': existing['root']}
        metadataKeys = DIVE_MetadataKeys().findOne(
            query=query,
            owner=str(owner['_id']),
        )
        if not metadataKeys:
            raise Exception(
                f'No DIVE_MetadataKeys document for metadataRoot={existing["root"]} '
                f'(deleteKey context datasetId={folder["_id"]})'
            )
        if existing['metadata'].get(key, None) is not None:
            del existing['metadata'][key]
            self.save(existing)

    def removeCustomKeys(self, folder, root, owner):
        # Must scope by root: the same dataset id must not be paired with another metadata collection's row.
        root_id = str(root)
        existing = self.findOne({'DIVEDataset': str(folder['_id']), 'root': root_id})
        if not existing:
            raise Exception(
                f'No DIVE_Metadata row for datasetId={folder["_id"]} and metadataRoot={root_id} '
                f'(cannot clear custom keys for replace import)'
            )
        query = {'root': existing['root']}
        metadataKeys = DIVE_MetadataKeys().findOne(
            query=query,
            owner=str(owner['_id']),
        )
        if not metadataKeys:
            raise Exception(
                f'No DIVE_MetadataKeys document for metadataRoot={query["root"]} and owner={owner["_id"]} '
                f'(removeCustomKeys context datasetId={folder["_id"]})'
            )
        keys_to_remove = [
            key
            for key in existing['metadata'].keys()
            if key
            not in ['LastModifiedTime', 'LastModifiedBy', 'DIVEDataset', 'filename', 'DIVE_Path']
            and not key.startswith('DIVE_')
            and not key.startswith('ffprobe')
        ]
        for key in keys_to_remove:
            del existing['metadata'][key]
        self.save(existing)

    def deleteKeys(self, root, owner, key):
        existing = self.find({'root': str(root['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {root["_id"]} found')
        query = {'root': existing['root']}
        metadataKeys = DIVE_MetadataKeys().findOne(
            query=query,
            owner=str(owner['_id']),
        )
        if not metadataKeys:
            raise Exception(f'Could not find the root metadataKeys with folderId: {root["_id"]}')
        del existing['metadata'][key]
        self.save(existing)


class DIVE_MetadataKeys(Model):
    # This is NOT an access controlled model; it is expected that all endpoints
    # will be sensibly guarded instead.
    def __init__(self):
        # Do the bindings before calling __init__(), in case a derived class
        # wants to change things in initialize()
        events.bind('model.folder.remove', 'removeImport', self._cleanupDeletedEntity)
        super().__init__()

    def _cleanupDeletedEntity(self, event):
        # remove data if the folderId matches
        entityDoc = event.info
        folderId = entityDoc['_id']
        dive_dataset = self.findOne({'root': str(folderId)})
        if dive_dataset is not None:
            self.remove(dive_dataset)

    def initialize(self):
        self.name = 'DIVE_MetadataKeys'
        self.ensureIndices(
            [
                'root',
                'owner',
                (
                    [
                        ('created', SortDir.ASCENDING),
                    ],
                    {},
                ),
            ]
        )

    def initialize_updated_data(self, folder, user):
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} found')
        else:
            if existing.get('unlocked', False) is False:
                existing['unlocked'] = []
            if user is not None:
                existing['owner'] = str(user['_id'])
            self.save(existing)

    def createMetadataKeys(self, root, owner, metadataKeys, created_date=None, replace=True):
        existing = self.findOne({'root': str(root['_id'])})
        if existing and not replace:
            return existing
        if not existing:
            if created_date is None:
                created = datetime.datetime.utcnow()
            else:
                created = parser.parse(created_date)

            existing = dict(
                root=str(root['_id']),
                metadataKeys=metadataKeys,
                unlocked=[],
                created=created,
                owner=str(owner['_id']),
            )
        else:
            existing['metadataKeys'] = metadataKeys
            existing['owner'] = str(owner['_id'])
        self.save(existing)
        return existing

    def validate(self, doc):
        if 'root' not in doc or not isinstance(doc['root'], str):
            raise ValidationException('owner must be a string')
        return doc

    def updateKeyDescription(self, folder, owner, key, description):
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} found')
        if owner['_id'] and existing['owner'] != str(owner['_id']):
            raise Exception('Only the Owner can modify key descriptions')
        if key not in existing['metadataKeys'].keys():
            raise Exception(f'Key: {key} not in the metadata keys')
        key_data = existing['metadataKeys'][key]
        text = (description or '').strip()
        if text:
            key_data['description'] = text
        else:
            key_data.pop('description', None)
        existing['metadataKeys'][key] = key_data
        self.save(existing)

    def mergeImportedKeyDescriptions(self, folder, owner, descriptions):
        """Apply descriptions from JSON/bulk import to existing metadata key definitions (one save)."""
        if not descriptions:
            return
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            return
        if owner['_id'] and existing['owner'] != str(owner['_id']):
            raise Exception('Only the Owner can modify key descriptions')
        changed = False
        for key, text in descriptions.items():
            if key not in existing['metadataKeys']:
                continue
            t = (text or '').strip()
            if not t:
                continue
            key_data = existing['metadataKeys'][key]
            if key_data.get('description') != t:
                key_data['description'] = t
                existing['metadataKeys'][key] = key_data
                changed = True
        if changed:
            self.save(existing)

    def modifyKeyPermission(self, folder, owner, key, unlocked):
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} found')
        if owner['_id'] and existing['owner'] != str(owner['_id']):
            raise Exception('Only the Owner can modify key permissions')
        elif existing:
            if key in ['LastModifiedTime', 'LastModifiedBy']:
                raise Exception('LastModifiedTime and LastModifiedBy are not modifiable')
            if key not in existing['metadataKeys'].keys():
                raise Exception(f'Key: {key} not in the metadata keys to modify permission')
            else:
                if not existing.get('unlocked', False):
                    existing['unlocked'] = []
                    self.save(existing)
                if unlocked and key not in existing.get('unlocked', {}):
                    existing['unlocked'].append(key)
                    self.save(existing)
                if not unlocked and key in existing['unlocked']:
                    existing['unlocked'].remove(key)
                    self.save(existing)

    def addKey(
        self,
        folder,
        owner,
        key,
        info={"set": set(), "count": 0, "category": "categorical"},  # noqa: B006
        unlocked=True,
    ):
        # info is {"type": datatype, "set": set(), "count": 0} may include range: {min: number, max: number}
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} found')
        if owner['_id'] and existing['owner'] != str(owner['_id']):
            raise Exception('Only the Owner can modify key permissions')
        elif existing:
            if key in existing['metadataKeys'].keys():
                raise Exception(f'Key: {key} already exists in the dataset and cannot be added')
            else:
                existing["metadataKeys"][key] = info
                if unlocked and key not in existing.get('unlocked', {}):
                    existing['unlocked'].append(key)
                self.save(existing)

    def addModifiedKeys(self, folder):
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} not found')
        elif existing and existing.get('metadataKeys', {}).get('LastModifiedTime', None) is None:
            keys = ['LastModifiedTime', 'LastModifiedBy']
            for key in keys:
                if key not in existing['metadataKeys'].keys():
                    if key == 'LastModifiedTime':
                        existing['metadataKeys'][key] = {'category': 'search', 'set': []}
                    else:
                        existing['metadataKeys'][key] = {'category': 'categorical', 'set': []}
            self.save(existing)

    def deleteKey(self, folder, owner, key):
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} not found')
        if owner['_id'] and existing['owner'] != str(owner['_id']):
            raise Exception('Only the Owner can modify key permissions')
        elif existing:
            if key in existing['unlocked']:
                existing['unlocked'].remove(key)
            if key in existing['metadataKeys'].keys():
                del existing['metadataKeys'][key]
                self.save(existing)
            else:
                raise Exception(f'Key: {key} not found in the current metdata')

    def removeCustomKeys(self, folderId, owner):
        existing = self.findOne({'root': str(folderId)})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folderId} not found')
        if owner['_id'] and existing['owner'] != str(owner['_id']):
            raise Exception('Only the Owner can modify key permissions')
        elif existing:
            keys_to_remove = [
                key
                for key in existing['metadataKeys'].keys()
                if key
                not in [
                    'LastModifiedTime',
                    'LastModifiedBy',
                    'DIVEDataset',
                    'filename',
                    'DIVE_Path',
                ]
                and not key.startswith('DIVE_')
                and not key.startswith('ffprobe')
            ]
            for key in keys_to_remove:
                if key in existing['unlocked']:
                    existing['unlocked'].remove(key)
                if key in existing['metadataKeys'].keys():
                    del existing['metadataKeys'][key]
            self.save(existing)

    def updateKeyValue(self, folderId, owner, key, value, categoricalLimit):
        existing = self.findOne({'root': folderId})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folderId} not found')
        if key not in existing['metadataKeys'].keys():
            raise Exception(f'Key: {key} is not in the metadata')
        keyData = existing['metadataKeys'][key]
        category = keyData['category']
        if category == 'categorical':
            keyDataSet = set(categorical_values_for_schema(keyData.get('set', [])))
            skip_add = is_nonfinite_numeric_placeholder(value)
            if not skip_add:
                if len(keyDataSet) + 1 < categoricalLimit:
                    keyDataSet.add(value)
                else:
                    keyData['category'] = 'search'
                    keyData.pop('set', None)
            if keyData.get('category') == 'categorical':
                keyData['set'] = list(keyDataSet)
        if category == 'numerical' and keyData.get('range', False):
            merge_numeric_sample_into_range_dict(keyData['range'], value)
        existing['metadataKeys'][key] = keyData
        self.save(existing)
