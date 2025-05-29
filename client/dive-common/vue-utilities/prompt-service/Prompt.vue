<script lang="ts">
import {
  ref, Ref, watch, nextTick, defineComponent,
} from 'vue';

export default defineComponent({
  name: 'Prompt',
  props: {},
  setup() {
    const show = ref(false);
    const title = ref('');
    const text: Ref<string | string[]> = ref('');
    const positiveButton = ref('Confirm');
    const negativeButton = ref('Cancel');
    const selected = ref('positive');
    const confirm = ref(false);
    const valueType: Ref<'text' | 'number' | 'boolean' | undefined > = ref(undefined);
    const value: Ref<string | boolean | number| null> = ref(null);
    const valueList: Ref<string[] | undefined> = ref(undefined);
    const lockedValueList = ref(true);
    const allowNullValueList = ref(false);

    /**
     * Placeholder resolver function.  Wrapped in object so that
     * its reference isn't changed on reassign.
     */
    const functions = {
      resolve(val: boolean | number | string | null) {
        return val;
      },
    };

    const positive: Ref<HTMLFormElement | null> = ref(null);
    const negative: Ref<HTMLFormElement | null> = ref(null);
    const input: Ref<HTMLFormElement | null> = ref(null);

    async function clickPositive() {
      show.value = false;
      if (valueType.value === undefined) {
        functions.resolve(true);
      } else {
        functions.resolve(value.value);
      }
    }

    async function clickNegative() {
      show.value = false;
      if (valueType.value === undefined) {
        functions.resolve(false);
      } else {
        functions.resolve(null);
      }
    }

    async function select() {
      if (selected.value === 'positive') {
        clickPositive();
      } else {
        clickNegative();
      }
    }

    async function focusPositive() {
      if (positive.value) {
        // vuetify 2 hack: need to add extra .$el property, may be removed in vuetify 3
        positive.value.$el.focus();
        selected.value = 'positive';
      }
    }

    async function focusNegative() {
      if (negative.value) {
        // vuetify 2 hack: need to add extra .$el property, may be removed in vuetify 3
        negative.value.$el.focus();
        selected.value = 'negative';
      }
    }

    const watchValueKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && value.value !== null && valueType.value !== undefined) {
        clickPositive();
      }
    };

    watch(valueType, () => {
      if (valueType.value) {
        window.document.addEventListener('keypress', watchValueKey);
      }
    });

    watch(show, async (val) => {
      if (!allowNullValueList.value && valueList.value?.length && valueList.value[0]) {
      // eslint-disable-next-line prefer-destructuring
        value.value = valueList.value[0];
      }
      if (!val) {
        if (valueType.value === undefined) {
          functions.resolve(false);
        } else {
          functions.resolve(null);
        }
      } else if (positive.value) {
        if (valueType.value === undefined && positive.value) {
          selected.value = 'positive';
          // Needs to mount and then dialog transition, single tick doesn't work
          await nextTick();
          await nextTick();
          // vuetify 2 hack: need to add extra .$el property, may be removed in vuetify 3
          positive.value.$el.focus();
        }
      }
    });

    return {
      show,
      title,
      text,
      positiveButton,
      negativeButton,
      selected,
      confirm,
      functions,
      value,
      valueType,
      lockedValueList,
      valueList,
      clickPositive,
      clickNegative,
      select,
      input,
      positive,
      negative,
      focusPositive,
      focusNegative,
    };
  },
});
</script>

<template>
  <v-dialog
    v-model="show"
    max-width="400"
  >
    <v-card>
      <v-card-title
        v-if="title"
        v-mousetrap="[
          { bind: 'left', handler: () => focusNegative(), disable: !show },
          { bind: 'right', handler: () => focusPositive(), disable: !show },
          { bind: 'enter', handler: () => select(), disable: !show },
        ]"
        class="title"
      >
        {{ title }}
      </v-card-title>
      <v-card-text v-if="Array.isArray(text)">
        <div
          v-for="(item, key) in text"
          :key="key"
        >
          {{ item }}
        </div>
      </v-card-text>
      <v-card-text v-else>
        <p>{{ text }}</p>
        <v-row v-if="valueType !== undefined">
          <v-combobox
            v-if="valueType === 'text' && valueList && valueList.length && !lockedValueList"
            ref="input"
            v-model="value"
            :items="valueList"
            outlined
            autofocus
          />
          <v-textarea
            v-else-if="valueType === 'text' && (!valueList || !lockedValueList) && value ? value?.toString().length > 50 : false"
            ref="input"
            v-model="value"
            autofocus
          />

          <v-text-field
            v-else-if="valueType === 'text' && (!valueList || !lockedValueList)"
            ref="input"
            v-model="value"
            autofocus
          />
          <v-select
            v-else-if="valueType === 'text' && valueList && valueList.length"
            ref="input"
            v-model="value"
            :items="valueList"
            outlined
            autofocus
          />
          <v-text-field
            v-else-if="valueType === 'number'"
            ref="input"
            v-model.number="value"
            autofocus
            step="0.1"
            type="number"
          />
          <v-switch
            v-else-if="valueType === 'boolean'"
            ref="input"
            v-model="value"
          />
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          v-if="confirm && negativeButton && negativeButton.length"
          ref="negative"
          text
          @click="clickNegative"
        >
          {{ negativeButton }}
        </v-btn>
        <v-btn
          ref="positive"
          color="primary"
          text
          @click="clickPositive"
        >
          {{ positiveButton }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
