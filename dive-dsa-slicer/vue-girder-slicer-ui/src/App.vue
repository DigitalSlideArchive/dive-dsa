<script lang="ts">
import { Ref, defineComponent, onMounted, ref } from 'vue';
import GirderSlicerTaskButton from './components/GirderSlicerTaskButton.tw.vue';
import GirderSlicerTaskCard from './components/GirderSlicerTaskCard.tw.vue';
import GirderSlicerTaskMenu from './components/GirderSlicerTaskMenu.tw.vue';
import GirderSlicerTaskMenuModal from './components/GirderSlicerTaskMenuModalButton.tw.vue';
import GirderSlicerTasksIntegrated from './components/GirderSlicerTasksIntegrated.tw.vue'
import DataBrowser from './components/FileBrowser/DataBrowser.tw.vue';
import Modal from './components/FileBrowser/Modal.tw.vue';
import RestClient from './api/girderRest';
import type { GirderModel } from './girderTypes';
import { XMLParameters } from './parser/parserTypes';
import { SlicerTask } from './api/girderSlicerApi';


export default defineComponent({
  name: 'App',
  components: {
    GirderSlicerTaskButton,
    GirderSlicerTaskMenu,
    GirderSlicerTaskCard,
    GirderSlicerTaskMenuModal,
    GirderSlicerTasksIntegrated,
    DataBrowser,
    Modal,
  },
  props: {
    
  },
  setup() {
    const selected: Ref<string | null> = ref(null);
    const apiUrl = 'api/v1';
    const girderRest = new RestClient({ apiRoot: apiUrl, setLocalCookie: true });
    const username = ref('admin');
    const password = ref('letmein');
    const loginError = ref('');
    const loginBusy = ref(false);
    const loggedInUser = ref<string | null>(null);
    // Remount child components after auth changes so they pick up the new token.
    const authKey = ref(0);

    const select = (id: string) => {
      selected.value = id;
    }
    const showBrowser = ref(false);

    const refreshAuth = async () => {
      if (!girderRest.token) {
        loggedInUser.value = null;
        return;
      }
      try {
        const user = await girderRest.fetchUser();
        loggedInUser.value = user?.login ?? null;
        if (girderRest.token) {
          window.localStorage.setItem('girderToken', girderRest.token);
        }
      } catch {
        loggedInUser.value = null;
        girderRest.token = null;
        window.localStorage.removeItem('girderToken');
      }
    };

    const login = async () => {
      loginError.value = '';
      loginBusy.value = true;
      try {
        await girderRest.login(username.value, password.value);
        if (girderRest.token) {
          window.localStorage.setItem('girderToken', girderRest.token);
        }
        loggedInUser.value = girderRest.user?.login ?? username.value;
        authKey.value += 1;
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        loginError.value = message || 'Login failed';
        loggedInUser.value = null;
      } finally {
        loginBusy.value = false;
      }
    };

    const logout = async () => {
      loginError.value = '';
      try {
        await girderRest.logout();
      } catch {
        // ignore logout errors for the local demo page
      }
      window.localStorage.removeItem('girderToken');
      loggedInUser.value = null;
      authKey.value += 1;
    };

    const validate = (e: GirderModel) => {
      if (e.name.includes('jpg')) {
        return  { valid: true}
      } else {
        return {valid: false, msg: 'Item needs to be of type jpg'}
      }
    };

    const chanelDefaults = (item: XMLParameters) => {
      if (item.channel === 'input' && item.type === 'file') {
        item.fileValue = {
          fileId: '6433f9123b271b58c749ddbc',
          girderId: '6433f9123b271b58c749ddbb',
          name: 'SampleVideo.mp4',
          parentId: '6433f9113b271b58c749ddb6',
          regExp: false,
        }
        return item;
      }
      if (item.channel === 'output' && item.type === 'new-file') {
        item.fileValue = {
          fileId: undefined,
          girderId: '6433f9113b271b58c749ddb6',
          name: 'SampleFile.json',
          parentId: '6433f9113b271b58c749ddb6',
          regExp: false,
        }
        return item;
      }

    }

    const filter = (item: SlicerTask) => item.image.includes('dive');

    onMounted(() => {
      refreshAuth();
    });

    return {
      selected,
      select,
      showBrowser,
      validate,
      chanelDefaults,
      filter,
      username,
      password,
      loginError,
      loginBusy,
      loggedInUser,
      authKey,
      login,
      logout,
    };

  },
});
</script>

<template>
    <div
    class="card"
  >
    <div class="card-body">
      <div class="dev-login">
        <template v-if="loggedInUser">
          <span class="dev-login-status">Logged in as {{ loggedInUser }}</span>
          <button
            class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-sm"
            type="button"
            @click="logout"
          >
            Log out
          </button>
        </template>
        <template v-else>
          <input
            v-model="username"
            class="dev-login-input"
            type="text"
            placeholder="Username"
            autocomplete="username"
            @keyup.enter="login"
          >
          <input
            v-model="password"
            class="dev-login-input"
            type="password"
            placeholder="Password"
            autocomplete="current-password"
            @keyup.enter="login"
          >
          <button
            class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-sm"
            type="button"
            :disabled="loginBusy"
            @click="login"
          >
            {{ loginBusy ? 'Logging in…' : 'Log in' }}
          </button>
        </template>
        <p v-if="loginError" class="dev-login-error">{{ loginError }}</p>
      </div>
      <div class="card-title justify-content-center row g-20"
>

  <div class="col">
    <!-- <girder-slicer-task-card :task-id="selected" />

    <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-sm"
    @click="showBrowser = true"
    >
    File Browser
  </button>
    <data-browser
      v-if="showBrowser"
      :validation="validate"
      type="file"
      @close="showBrowser=false"
    /> -->
    <girder-slicer-tasks-integrated
      :key="authKey"
      :defaults="chanelDefaults"
      :filter="filter"
    />
    <!-- <girder-slicer-task-menu /> -->
    <!-- <girder-slicer-task-button @selected="select($event)" /> -->
  </div>
  </div>
  </div>
  </div>
</template>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  margin-top: 60px;
}
body {
  margin: 0;
  display: flex;
  place-items: center;
  align-content: center;
  min-width: 320px;
  min-height: 100vh;
  background-color: #4a4949;
}

.dev-login {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: #fff;
}

.dev-login-input {
  padding: 8px 10px;
  border: 1px solid #777;
  border-radius: 4px;
  background: #2f2f2f;
  color: #fff;
}

.dev-login-status {
  margin-right: 4px;
}

.dev-login-error {
  width: 100%;
  margin: 0;
  color: #ffb4b4;
}
</style>

