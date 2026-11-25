import { createRouter, createWebHistory } from "vue-router";
import ClientView from "./views/ClientView.vue";
import FarmerView from "./views/FarmerView.vue";
import AdminView from "./views/AdminView.vue";
import FarmView from "./views/FarmView.vue";
import MyBasketsView from "./views/MyBasketsView.vue";
import ReceivedOrdersView from "./views/ReceivedOrdersView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "client", component: ClientView },
    { path: "/producteur", name: "farmer", component: FarmerView },
    { path: "/admin", name: "admin", component: AdminView },
    { path: "/ferme/:id", name: "farm", component: FarmView },
    // Basket flow (`C1-F4`, `C2-F5`). Access is decided by the views themselves:
    // the real authority is the server-side role check (`ADR-07`).
    { path: "/mes-paniers", name: "my-baskets", component: MyBasketsView },
    { path: "/producteur/commandes", name: "received-orders", component: ReceivedOrdersView },
  ],
});

export default router;
