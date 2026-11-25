<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchMyFarm, type Farm, type Product } from "../api";
import { authState, clearSession, currentRole } from "../auth";
import AuthModal from "../components/AuthModal.vue";
import FarmEditor from "../components/FarmEditor.vue";
import ProductManager from "../components/ProductManager.vue";

const farm = ref<Farm | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);

/** A producer session is required to manage a storefront. */
const isFarmer = computed(() => currentRole.value === "FARMER");
const isLoggedIn = computed(() => authState.token !== null);

const statusInfo = computed(() => {
  if (!farm.value) return null;
  switch (farm.value.status) {
    case "APPROVED":
      return {
        label: "Approuvée — visible sur la carte (modifications instantanées)",
        classes: "border-green-300 bg-green-50 text-green-800",
      };
    case "REJECTED":
      return {
        label: "Rejetée — corrige tes informations et réenregistre",
        classes: "border-red-300 bg-red-50 text-red-800",
      };
    default:
      return {
        label: "En attente d'approbation — masquée du public",
        classes: "border-amber-300 bg-amber-50 text-amber-800",
      };
  }
});

async function loadFarm() {
  if (!isFarmer.value) return;
  loading.value = true;
  loadError.value = null;
  try {
    farm.value = await fetchMyFarm();
  } catch (err) {
    loadError.value =
      err instanceof Error ? err.message : "Impossible de charger votre espace producteur.";
  } finally {
    loading.value = false;
  }
}



function logout() {
  clearSession();
  farm.value = null;
  loadError.value = null;
}

function onFarmSaved(saved: Farm) {
  farm.value = { ...saved, products: saved.products ?? farm.value?.products ?? [] };
}

function onProductsUpdated(products: Product[]) {
  if (farm.value) {
    farm.value = { ...farm.value, products };
  }
}

// Load as soon as a producer session exists (including after login).
watch(
  isFarmer,
  (farmer) => {
    if (farmer) void loadFarm();
  },
  { immediate: true },
);

onMounted(() => {
  if (isFarmer.value) void loadFarm();
});
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 py-8 text-left">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Espace Producteur</h1>
        <p class="text-sm text-gray-500">Gère ta vitrine et ton catalogue de produits.</p>
      </div>

      <div class="flex items-center gap-3">
        <span
          v-if="statusInfo"
          class="rounded-full border px-3 py-1 text-xs font-medium"
          :class="statusInfo.classes"
        >
          {{ statusInfo.label }}
        </span>
        <button
          v-if="isLoggedIn"
          type="button"
          class="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          @click="logout"
        >
          Se déconnecter
        </button>
      </div>
    </header>

    <!-- 1. Pas de session : vrai écran de connexion/inscription (`T1.3`) -->
    <AuthModal
      v-if="!isLoggedIn"
      initial-mode="login"
      forced-role="FARMER"
      @authenticated="loadFarm"
    />

    <!-- 2. Connecté mais avec un autre rôle -->
    <div
      v-else-if="!isFarmer"
      class="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      Ce compte n'a pas le rôle <strong>FARMER</strong>. Crée un compte producteur ou utilise
      un compte de démonstration depuis le panneau « Comptes de démo » du formulaire de connexion.
    </div>

    <template v-else>
      <div v-if="loading" class="py-8 text-center text-sm text-gray-500">
        Chargement de ta vitrine…
      </div>

      <div
        v-else-if="loadError"
        class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        {{ loadError }}
      </div>

      <template v-else>
        <!-- Bloc 1 : Vitrine (photo, texte riche, horaires, paiements) -->
        <FarmEditor :farm="farm" @saved="onFarmSaved" />

        <!-- Bloc 2 : Catalogue produits (débloqué dès que la vitrine existe) -->
        <ProductManager
          v-if="farm"
          :products="farm.products ?? []"
          @updated="onProductsUpdated"
        />
        <p
          v-else
          class="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500"
        >
          Enregistre d'abord ta vitrine ci-dessus pour pouvoir ajouter tes produits au catalogue.
        </p>
      </template>
    </template>
  </div>
</template>