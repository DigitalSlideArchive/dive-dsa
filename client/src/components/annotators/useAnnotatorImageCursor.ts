import { computed, Ref } from 'vue';

export default function useAnnotatorImageCursor(
  imageCursor: Ref<string>,
  cursor: Ref<string>,
  imageCursorEditing: Ref<boolean>,
) {
  const displayImageCursor = computed(() => imageCursor.value);
  const showEditBadge = computed(
    () => imageCursorEditing.value && !!imageCursor.value,
  );
  const showCreateBadge = computed(
    () => !imageCursorEditing.value && !!imageCursor.value,
  );
  const playbackCursor = computed(() => cursor.value);

  return {
    displayImageCursor,
    playbackCursor,
    showEditBadge,
    showCreateBadge,
  };
}
