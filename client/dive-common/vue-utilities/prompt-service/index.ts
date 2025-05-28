/* disabled this rule for Vue.prototype.FOO = */
/* eslint-disable no-param-reassign,func-names */

import { VueConstructor, watch } from 'vue';
import Vuetify from 'vuetify/lib';
import Prompt from './Prompt.vue';

export interface PromptParams {
  title: string;
  text: string | string[];
  positiveButton?: string;
  negativeButton?: string;
  valueType?: 'text' | 'number' | 'boolean';
  valueList?: string[];
  confirm?: boolean;
  lockedValueList?: boolean;
  allowNullValueList?: boolean;
  value?: string | number | boolean;
}

class PromptService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private component: any;

  constructor(Vue: VueConstructor, vuetify: Vuetify) {
    const PromptComponent = Vue.extend({ vuetify, ...Prompt });
    const component = new PromptComponent();
    this.component = component;
  }

  set(
    title: string,
    text: string | string[],
    positiveButton: string,
    negativeButton: string,
    confirm: boolean,
    resolve: (value: boolean) => unknown,
    valueType?: 'text' | 'number' | 'boolean',
    valueList?: string[],
    lockedValueList?: boolean,
    allowNullValueList?: boolean,
    value?: string | number | boolean,
  ): void {
    this.component.title = title;
    this.component.text = text;
    this.component.positiveButton = positiveButton;
    this.component.negativeButton = negativeButton;
    this.component.confirm = confirm;
    this.component.valueType = valueType;
    this.component.value = null;
    this.component.functions.resolve = resolve;
    this.component.show = true;
    this.component.valueList = valueList;
    this.component.lockedValueList = lockedValueList;
    this.component.allowNullValueList = allowNullValueList;
    this.component.value = value;
  }

  show({
    title,
    text,
    positiveButton = 'Confirm',
    negativeButton = 'Cancel',
    confirm = false,
  }: PromptParams): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!this.component.show) {
        this.set(title, text, positiveButton, negativeButton, confirm, resolve);
      } else {
        const unwatch = watch(this.component.show, () => {
          unwatch();
          this.set(title, text, positiveButton, negativeButton, confirm, resolve);
        });
      }
    });
  }

  inputValue({
    title,
    text,
    positiveButton = 'Confirm',
    negativeButton = 'Cancel',
    valueType = 'text',
    confirm = false,
    valueList = undefined,
    lockedValueList = true,
    allowNullValueList = true,
    value = undefined,
  }: PromptParams): Promise<boolean | number | string | null> {
    return new Promise<boolean | number | string | null>((resolve) => {
      if (!this.component.show) {
        this.set(
          title,
          text,
          positiveButton,
          negativeButton,
          confirm,
          resolve,
          valueType,
          valueList,
          lockedValueList,
          allowNullValueList,
          value,
        );
        return this.component.value;
      }
      const unwatch = watch(this.component.show, () => {
        unwatch();
        this.set(title, text, positiveButton, negativeButton, confirm, resolve, valueType);
        return null;
      });
      return null;
    });
  }

  visible(): boolean {
    return this.component.show;
  }

  invisible(): boolean {
    return !this.component.show;
  }

  hide(): void {
    this.component.show = false;
  }

  mount(element: HTMLElement): void {
    this.component.$mount(element);
  }
}

// in vue 3 should use provide/inject with symbol
let promptService: PromptService;

export function usePrompt() {
  // in vue 3 should use inject instead of singleton
  const prompt = (params: PromptParams) => promptService.show(params);
  const inputValue = (params: PromptParams) => promptService.inputValue(params);
  const visible = () => promptService.visible();
  const invisible = () => promptService.invisible();
  const hide = () => promptService.hide();

  return {
    prompt, visible, invisible, hide, inputValue,
  };
}

export default function (vuetify: Vuetify) {
  return function install(Vue: VueConstructor) {
    // in vue 3 should use provide instead of singleton
    promptService = new PromptService(Vue, vuetify);

    Vue.prototype.$promptAttach = function () {
      const div = document.createElement('div');
      this.$el.appendChild(div);
      if (promptService) {
        promptService.mount(div);
      }
      return this;
    };
  };
}
