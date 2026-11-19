import { createRouter, createWebHistory } from "vue-router";
import ClientView from "./views/ClientView.vue";
import FarmerView from "./views/FarmerView.vue";
import AdminView from "./views/AdminView.vue";
import FarmView from "./views/FarmView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "client", component: ClientView },
    { path: "/producteur", name: "farmer", component: FarmerView },
    { path: "/admin", name: "admin", component: AdminView },
    { path: "/ferme/:id", name: "farm", component: FarmView },
  ],
});

export default router;
