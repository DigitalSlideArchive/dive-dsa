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

    def createMetadata(self, folder, root, owner, metadata, created_date=None):
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
            )
        else:
            existing['metadata'] = metadata
            existing['filename'] = str(folder['name'])
            existing[root] = str(root['_id'])
        existing = self.save(existing)
        return existing

    def validate(self, doc):
        if not doc.get('DIVEDataset') or not isinstance(doc['DIVEDataset'], str):
            raise ValidationException('DIVEDataset must be a string')
        if 'root' not in doc or not isinstance(doc['root'], str):
            raise ValidationException('owner must be a string')
        return doc


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
                (
                    [
                        ('created', SortDir.ASCENDING),
                    ],
                    {},
                ),
            ]
        )

    def createMetadataKeys(self, root, owner, metadataKeys, created_date=None):
        existing = self.findOne({'root': str(root['_id'])})
        if not existing:
            if created_date is None:
                created = datetime.datetime.utcnow()
            else:
                created = parser.parse(created_date)

            existing = dict(
                root=str(root['_id']),
                metadataKeys=metadataKeys,
                created=created,
            )
        else:
            existing['metadataKeys'] = metadataKeys
        self.save(existing)
        return existing

    def validate(self, doc):
        if 'root' not in doc or not isinstance(doc['root'], str):
            raise ValidationException('owner must be a string')
        return doc
