import datetime

from dateutil import parser
from girder import events
from girder.constants import SortDir
from girder.exceptions import ValidationException
from girder.models.model_base import Model


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

    def createMetadata(self, folder, root, owner, metadata, created_date=None, unlocked=[]):
        existing = self.findOne({'DIVEDataset': str(folder['_id'])})
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

    def updateKey(self, folder, root, owner, key, value, categoricalLimit=50):
        existing = self.findOne({'DIVEDataset': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} found')
        query = {'root': existing['root']}
        metadataKeys = DIVE_MetadataKeys().findOne(
            query=query,
            owner=str(owner['_id']),
        )
        if not metadataKeys:
            raise Exception(f'Could not find the root metadataKeys with folderId: {folder["_id"]}')
        if key not in metadataKeys['unlocked']:
            raise Exception(f'Key {key} is not unlocked for this metadata and cannot be modified')
        if metadataKeys['metadataKeys'][key]['category'] == 'numerical':
            existing['metadata'][key] = float(value)
        else:
            existing['metadata'][key] = value
        self.save(existing)
        # now we need to update the metadataKey
        DIVE_MetadataKeys().updateKeyValue(existing['root'], owner, key, value, categoricalLimit)

    def deleteKey(self, folder, root, owner, key):
        existing = self.findOne({'DIVEDataset': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} found')
        query = {'root': existing['root']}
        metadataKeys = DIVE_MetadataKeys().findOne(
            query=query,
            owner=str(owner['_id']),
        )
        if not metadataKeys:
            raise Exception(f'Could not find the root metadataKeys with folderId: {folder["_id"]}')
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

    def createMetadataKeys(self, root, owner, metadataKeys, created_date=None, unlocked=[]):
        existing = self.findOne({'root': str(root['_id'])})
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

    def modifyKeyPermission(self, folder, owner, key, unlocked):
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} found')
        if owner['_id'] and existing['owner'] != str(owner['_id']):
            raise Exception('Only the Owner can modify key permissions')
        elif existing:
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
                    existing.remove(key)
                    self.save(existing)

    def addKey(
        self,
        folder,
        owner,
        key,
        info={"set": set(), "count": 0, "category": "categorical"},
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

    def deleteKey(self, folder, owner, key):
        existing = self.findOne({'root': str(folder['_id'])})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folder["_id"]} found')
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

    def updateKeyValue(self, folderId, owner, key, value, categoricalLimit):
        existing = self.findOne({'root': folderId})
        if not existing:
            raise Exception(f'Note MetadataKeys with folderId: {folderId} not found')
        if key not in existing['metadataKeys'].keys():
            raise Exception(f'Key: {key} is not in the metadata')
        keyData = existing['metadataKeys'][key]
        category = keyData['category']
        if category == 'categorical':
            if len(keyData['set']) + 1 < categoricalLimit:
                keyData['set'].add(value)
            else:
                keyData['category'] = 'search'
                del keyData['set']
        if category == 'numerical' and keyData.get('range', False):
            range = keyData['range']
            range['min'] = min(float(value), float(range['min']))
            range['max'] = max(float(value), float(range['max']))
            keyData['range'] = range
        existing['metadataKeys'][key] = keyData
        self.save(existing)
