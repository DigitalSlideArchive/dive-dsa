import { Attribute } from 'vue-media-annotator/use/AttributeTypes';
import { useHandler } from 'vue-media-annotator/provides';
import { useStore } from 'platform/web-girder/store/types';
import { usePrompt } from 'dive-common/vue-utilities/prompt-service';
import { setDiveDatasetMetadataKey } from 'platform/web-girder/api/divemetadata.service';

export default function useMetadataLinkUpdater() {
  const { prompt } = usePrompt();
  const store = useStore();
  const handler = useHandler();

  const updateAttributeMetadataLink = async (attribute: Attribute, value: unknown) => {
    if (attribute.belongs !== 'detection' || !attribute.metadataLink?.updateValue) {
      return;
    }
    const metadataKey = attribute.metadataLink.key?.trim();
    if (!metadataKey) {
      return;
    }
    const metadataRootId = handler.getDiveMetadataRootId();
    const datasetId = store.state.Dataset.meta?.id;
    if (!metadataRootId || !datasetId) {
      return;
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return;
    }
    try {
      await setDiveDatasetMetadataKey(datasetId, metadataRootId, metadataKey, value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error;
      let promptText = `Failed to update metadata key: ${metadataKey}. Error: ${errorMsg}`;
      if (errorMsg.includes('No editable keys in the metadata to update')) {
        promptText = `The metadata key: ${metadataKey} is not editable. Please contact the administrator/ownder of the DIVEMetadata to unlock it.`;
      }
      await prompt({
        title: 'Metadata Error',
        text: promptText,
        positiveButton: 'OK',
      });
    }
  };

  return {
    updateAttributeMetadataLink,
  };
}
