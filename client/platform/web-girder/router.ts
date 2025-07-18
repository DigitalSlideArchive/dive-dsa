import Vue from 'vue';
import Router, { Route } from 'vue-router';

import girderRest from './plugins/girder';
import Home from './views/Home.vue';
import Jobs from './views/Jobs.vue';
import Login from './views/Login.vue';
import RouterPage from './views/RouterPage.vue';
import AdminPage from './views/AdminPage.vue';
import ViewerLoader from './views/ViewerLoader.vue';
import DataShared from './views/DataShared.vue';
import DataBrowser from './views/DataBrowser.vue';
import Summary from './views/Summary.vue';
import DIVEMetadataSearchVue from './views/DIVEMetadata/DIVEMetadataSearch.vue';
import DiveMetadataEditVue from './views/DIVEMetadata/DIVEMetadataEdit.vue';

Vue.use(Router);
let previousViewerRoute = '';

export function getPreviousViewerRoute() {
  return previousViewerRoute;
}
// eslint-disable-next-line @typescript-eslint/ban-types
function beforeEnter(to: Route, from: Route, next: Function) {
  if (to.fullPath.includes('/viewer') && !from.fullPath.includes('/viewer')) {
    previousViewerRoute = from.fullPath;
  }
  if (!girderRest.user) {
    next('/login');
  } else {
    next();
  }
}

// eslint-disable-next-line @typescript-eslint/ban-types
function adminGuard(to: Route, from: Route, next: Function) {
  if (!girderRest.user.admin) {
    next('/');
  } else {
    next();
  }
}

const router = new Router({
  routes: [
    {
      path: '/login',
      name: 'login',
      component: Login,
    },
    {
      path: '/viewer/:id',
      name: 'viewer',
      component: ViewerLoader,
      props: true,
      beforeEnter,
    },
    {
      path: '/viewer/:id/revision/:revision',
      name: 'revision viewer',
      component: ViewerLoader,
      props: true,
      beforeEnter,
    },
    {
      path: '/',
      component: RouterPage,
      children: [
        {
          path: '/admin',
          name: 'admin',
          component: AdminPage,
          props: true,
          beforeEnter: adminGuard,
        },
        {
          path: 'jobs',
          name: 'jobs',
          component: Jobs,
          beforeEnter,
        },
        {
          path: '/metadata/:id/',
          name: 'metadata',
          component: DIVEMetadataSearchVue,
          props: (route) => {
            if (route.query.filter) {
              return {
                id: route.params.id, // Map route parameter to prop
                filter: JSON.parse(route.query.filter as string), // Map query parameter to prop
              };
            }
            return {
              id: route.params.id,
            };
          },
          beforeEnter,
        },
        {
          path: '/metadata-edit/:id/',
          name: 'metadata-edit',
          component: DiveMetadataEditVue,
          props: (route) => {
            if (route.query.filter) {
              return {
                id: route.params.id, // Map route parameter to prop
              };
            }
            return {
              id: route.params.id,
            };
          },
          beforeEnter,
        },
        {
          path: '',
          component: Home,
          children: [
            {
              path: 'shared',
              name: 'shared',
              component: DataShared,
              beforeEnter,
            },
            {
              path: 'summary',
              name: 'summary',
              component: Summary,
              beforeEnter,
            },
            {
              path: ':routeType?/:routeId?',
              name: 'home',
              component: DataBrowser,
              beforeEnter,
            },
          ],
        },
      ],
    },
  ],
});

export default router;
