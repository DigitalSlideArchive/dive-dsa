import { getCurrentInstance, onBeforeUnmount, onMounted } from 'vue';

/**
 * Move this component's root element to document.body so fixed
 * overlays escape parent stacking contexts and overflow clipping
 * (e.g. DIVE SidebarContext under the app bar).
 */
export function useMountToBody(): void {
  onMounted(() => {
    const el = getCurrentInstance()?.proxy?.$el as Node | undefined;
    if (el && el.nodeType === Node.ELEMENT_NODE && el.parentNode !== document.body) {
      document.body.appendChild(el);
    }
  });

  onBeforeUnmount(() => {
    const el = getCurrentInstance()?.proxy?.$el as Node | undefined;
    if (el?.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
}
