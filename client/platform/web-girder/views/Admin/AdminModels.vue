<script lang="ts">
import {
  computed, defineComponent, onMounted, ref, Ref, watch,
} from 'vue';
import {
  getHFModelSource,
  HFModelRepo,
  HFModelSource,
  HFModelSourceKind,
  HUGGING_FACE_HOST,
  listHFModelRepos,
  localModelHost,
  modelHostFor,
  putHFModelSource,
  resetSamModelHostCache,
} from 'platform/web-girder/api/hfmodels.service';
import { SAM_LABELS, SAM_MODELS, SamModel } from 'dive-common/use/segmentation/samModels';

type CheckState = 'checking' | 'ok' | 'missing' | 'error';

interface SourceOption { value: HFModelSourceKind; label: string; hint: string }

const sourceOptions: SourceOption[] = [
  {
    value: 'auto',
    label: 'Automatic',
    hint: 'Use the models stored in DIVE-DSA when they have been imported, otherwise the Hugging Face Hub.',
  },
  {
    value: 'huggingface',
    label: 'Hugging Face Hub',
    hint: 'Always download from huggingface.co.',
  },
  {
    value: 'local',
    label: 'DIVE-DSA only',
    hint: 'Only use models stored in DIVE-DSA. Browsers never contact huggingface.co, and models that have not been imported fail to load.',
  },
  {
    value: 'custom',
    label: 'Custom server',
    hint: 'A mirror that uses the Hub layout: <server>/<org>/<repo>/resolve/main/<file>.',
  },
];

export default defineComponent({
  name: 'AdminModels',
  setup() {
    const config: Ref<HFModelSource> = ref({ source: 'auto', customHost: null });
    const saved: Ref<HFModelSource> = ref({ source: 'auto', customHost: null });
    const repos: Ref<HFModelRepo[]> = ref([]);
    const loadError = ref('');
    const saveError = ref('');
    const saving = ref(false);
    const savedMessage = ref(false);
    const checks: Ref<Partial<Record<SamModel, CheckState>>> = ref({});
    // Replaced at build time (vite `define`), so read it as written.
    const buildHost = process.env.VUE_APP_SAM_MODEL_HOST || '';
    const localHost = localModelHost();

    const repoIds = computed(() => new Set(repos.value.map((repo) => repo.repoId)));
    const dirty = computed(() => config.value.source !== saved.value.source
      || (config.value.source === 'custom' && (config.value.customHost || '') !== (saved.value.customHost || '')));
    const customHostError = computed(() => {
      if (config.value.source !== 'custom') return '';
      try {
        const url = new URL(config.value.customHost || '');
        return ['http:', 'https:'].includes(url.protocol) ? '' : 'Use an http(s) URL';
      } catch {
        return 'Enter the server URL';
      }
    });

    const samRows = computed(() => (Object.keys(SAM_MODELS) as SamModel[]).map((kind) => {
      const id = SAM_MODELS[kind];
      const host = buildHost || modelHostFor(config.value, repoIds.value, id) || HUGGING_FACE_HOST;
      let where = 'Hugging Face Hub';
      if (buildHost) where = 'Build setting';
      else if (host === localHost) where = 'DIVE-DSA';
      else if (host !== HUGGING_FACE_HOST) where = 'Custom server';
      return {
        kind,
        id,
        label: SAM_LABELS[kind],
        stored: repoIds.value.has(id),
        where,
        url: `${host.replace(/\/*$/, '/')}${id}/resolve/main/config.json`,
      };
    }));

    const otherRepos = computed(() => {
      const sam = new Set(Object.values(SAM_MODELS));
      return repos.value.filter((repo) => !sam.has(repo.repoId));
    });

    async function load() {
      loadError.value = '';
      try {
        const [sourceResp, reposResp] = await Promise.all([getHFModelSource(), listHFModelRepos()]);
        config.value = { ...sourceResp.data };
        saved.value = { ...sourceResp.data };
        repos.value = reposResp.data;
      } catch (err) {
        loadError.value = 'Could not reach the dive_hf_models server plugin. Is it installed?';
      }
    }

    async function save() {
      saveError.value = '';
      saving.value = true;
      try {
        const { data } = await putHFModelSource({
          source: config.value.source,
          customHost: config.value.source === 'custom' ? config.value.customHost : null,
        });
        config.value = { ...data };
        saved.value = { ...data };
        resetSamModelHostCache();
        savedMessage.value = true;
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        saveError.value = (err as any)?.response?.data?.message || String(err);
      } finally {
        saving.value = false;
      }
    }

    /** Fetch each SAM model's config.json from where the browser would load it. */
    async function check() {
      await Promise.all(samRows.value.map(async (row) => {
        checks.value = { ...checks.value, [row.kind]: 'checking' };
        let state: CheckState;
        try {
          const resp = await fetch(row.url, { credentials: 'same-origin' });
          if (resp.ok) state = 'ok';
          else state = resp.status === 404 ? 'missing' : 'error';
        } catch {
          state = 'error';
        }
        checks.value = { ...checks.value, [row.kind]: state };
      }));
    }

    const checkIcons: Record<CheckState, { icon: string; color: string; text: string }> = {
      checking: { icon: 'mdi-progress-clock', color: 'grey', text: 'Checking…' },
      ok: { icon: 'mdi-check-circle', color: 'success', text: 'Reachable' },
      missing: { icon: 'mdi-alert-circle', color: 'warning', text: 'Not found' },
      error: { icon: 'mdi-close-circle', color: 'error', text: 'Unreachable' },
    };

    // Results describe the previous selection once the source changes.
    watch(samRows, () => { checks.value = {}; });

    onMounted(load);

    return {
      config,
      repos,
      otherRepos,
      samRows,
      sourceOptions,
      buildHost,
      localHost,
      loadError,
      saveError,
      saving,
      savedMessage,
      dirty,
      customHostError,
      checks,
      checkIcons,
      save,
      check,
      load,
    };
  },
});
</script>

<template>
  <v-container>
    <v-card>
      <v-card-title>Browser Model Source</v-card-title>
      <v-card-text>
        <p>
          Where browsers download the transformers.js models used by the
          <b>Segment</b> tool (SAM2 point-click segmentation).
          Each browser keeps a downloaded model in its cache, so changing this
          only affects downloads of models the browser does not have yet.
        </p>
        <v-alert
          v-if="loadError"
          type="error"
          dense
          outlined
        >
          {{ loadError }}
        </v-alert>
        <v-alert
          v-if="buildHost"
          type="info"
          dense
          outlined
        >
          This client was built with <code>VUE_APP_SAM_MODEL_HOST={{ buildHost }}</code>,
          which overrides the setting below.
        </v-alert>
        <v-radio-group
          v-model="config.source"
          class="mt-0"
          :disabled="!!loadError"
        >
          <v-radio
            v-for="option in sourceOptions"
            :key="option.value"
            :value="option.value"
          >
            <template #label>
              <div>
                <div class="text-body-1">
                  {{ option.label }}
                </div>
                <div class="text-caption grey--text">
                  {{ option.hint }}
                </div>
              </div>
            </template>
          </v-radio>
        </v-radio-group>
        <v-text-field
          v-if="config.source === 'custom'"
          v-model="config.customHost"
          label="Custom server URL"
          placeholder="https://models.example.org/"
          :error-messages="customHostError"
          outlined
          dense
        />
        <v-alert
          v-if="config.source === 'local' && samRows.some((row) => !row.stored)"
          type="warning"
          dense
          outlined
        >
          Some SAM2 models are not stored in DIVE-DSA, so they will not load.
          Import them with <code>dive-hf-models sync</code>.
        </v-alert>
        <v-alert
          v-if="saveError"
          type="error"
          dense
          outlined
        >
          {{ saveError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-btn
          text
          :disabled="!!loadError"
          @click="check"
        >
          <v-icon left>
            mdi-lan-connect
          </v-icon>
          Test
        </v-btn>
        <v-spacer />
        <v-btn
          text
          :disabled="!dirty || saving"
          @click="load"
        >
          Reset
        </v-btn>
        <v-btn
          color="success"
          :disabled="!dirty || !!customHostError || !!loadError"
          :loading="saving"
          @click="save"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card class="mt-4">
      <v-card-title>Segment Tool Models</v-card-title>
      <v-card-text>
        <v-simple-table dense>
          <thead>
            <tr>
              <th>Model</th>
              <th>Stored in DIVE-DSA</th>
              <th>Loads from</th>
              <th>Test</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in samRows"
              :key="row.kind"
            >
              <td>
                {{ row.label }}
                <div class="text-caption grey--text">
                  {{ row.id }}
                </div>
              </td>
              <td>
                <v-icon
                  small
                  :color="row.stored ? 'success' : 'grey'"
                >
                  {{ row.stored ? 'mdi-check' : 'mdi-minus' }}
                </v-icon>
              </td>
              <td>
                <a
                  :href="row.url"
                  target="_blank"
                  rel="noopener"
                >{{ row.where }}</a>
              </td>
              <td>
                <span
                  v-if="checks[row.kind]"
                  :class="`${checkIcons[checks[row.kind]].color}--text`"
                >
                  <v-icon
                    small
                    :color="checkIcons[checks[row.kind]].color"
                  >
                    {{ checkIcons[checks[row.kind]].icon }}
                  </v-icon>
                  {{ checkIcons[checks[row.kind]].text }}
                </span>
              </td>
            </tr>
          </tbody>
        </v-simple-table>
        <div
          v-if="otherRepos.length"
          class="mt-4"
        >
          <div class="text-subtitle-2">
            Other models stored in DIVE-DSA
          </div>
          <v-chip
            v-for="repo in otherRepos"
            :key="repo.repoId"
            small
            class="mr-2 mt-1"
          >
            {{ repo.repoId }}
          </v-chip>
        </div>
        <p class="mt-4 mb-0 text-caption">
          Models stored in DIVE-DSA are in the <b>DIVE HF Models</b> collection and are served from
          <code>{{ localHost }}</code>. To add or update them, run
          <code>dive-hf-models sync --api-url &lt;this server&gt;/api/v1</code>
          (<code>server/dive_hf_models/cli.py</code>).
        </p>
      </v-card-text>
    </v-card>
  </v-container>
</template>
