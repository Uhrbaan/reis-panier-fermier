<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchPendingFarms, setFarmStatus, paymentMethodLabel, type Farm } from "../api";
import { authState, clearSession, currentRole } from "../auth";
import AuthModal from "../components/AuthModal.vue";

/**
 * Administrator area (`C3-F1`).
 *
 * Lists the storefronts waiting for validation and lets an admin approve or
 * reject each one. Rejecting keeps the farm in the database; the producer sees
 * the `REJECTED` badge and, on their next save, it returns to
 * `PENDING_APPROVAL` automatically (`C2-F4`).
 */

const farms = ref<Farm[]>([]);
const loading = ref(false);
const errorMsg = ref<string | null>(null);
/** Id of the farm currently being approved/rejected, to disable its buttons. */
const busyId = ref<number | null>(null);
const notice = ref<string | null>(null);

const isAdmin = computed(() => currentRole.value === "ADMIN");
const isLoggedIn = computed(() => authState.token !== null);

async function load() {
  if (!isAdmin.value) return;

  loading.value = true;
  errorMsg.value = null;
  try {
    farms.value = await fetchPendingFarms();
  } catch (err) {
    errorMsg.value =
      err instanceof Error ? err.message : "Impossible de charger les fermes en attente.";
  } finally {
    loading.value = false;
  }
}

async function decide(farm: Farm, status: "APPROVED" | "REJECTED") {
  busyId.value = farm.id;
  errorMsg.value = null;
  notice.value = null;

  try {
    await setFarmStatus(farm.id, status);
    // Drop it from the queue locally: the endpoint only ever returns pending farms.
    farms.value = farms.value.filter((f) => f.id !== farm.id);
    notice.value =
      status === "APPROVED"
        ? `« ${farm.name} » est approuvée et désormais visible sur la carte.`
        : `« ${farm.name} » a été rejetée. Le producteur peut corriger et resoumettre.`;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Action impossible.";
  } finally {
    busyId.value = null;
  }
}

function logout() {
  clearSession();
  farms.value = [];
  notice.value = null;
  errorMsg.value = null;
}

/** Reload as soon as an admin session is opened in the modal. */
watch(isAdmin, (admin) => {
  if (admin) void load();
});

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 py-8 text-left">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Espace Administrateur</h1>
        <p class="text-sm text-gray-500">Valide les vitrines avant leur publication.</p>
      </div>
      <button
        v-if="isLoggedIn"
        type="button"
        class="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        @click="logout"
      >
        Se déconnecter
      </button>
    </header>

    <!-- 1. Pas de session -->
    <AuthModal
      v-if="!isLoggedIn"
      initial-mode="login"
      @authenticated="load"
    />

    <!-- 2. Connecté mais pas admin -->
    <div
      v-else-if="!isAdmin"
      class="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      Ce compte n'a pas le rôle <strong>ADMIN</strong>. Utilise le compte administrateur de
      démonstration depuis le panneau « Comptes de démo » du formulaire de connexion, ou consulte
      l'espace client / producteur.
    </div>

    <!-- 3. Admin -->
    <template v-else>
      <div
        v-if="errorMsg"
        role="alert"
        class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {{ errorMsg }}
      </div>
      <div
        v-if="notice"
        role="status"
        class="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900"
      >
        {{ notice }}
      </div>

      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-600">
          {{ farms.length }} ferme(s) en attente de validation
        </p>
        <button
          type="button"
          class="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          :disabled="loading"
          @click="load"
        >
          {{ loading ? "Chargement…" : "Rafraîchir" }}
        </button>
      </div>

      <p v-if="loading" class="py-8 text-center text-sm text-gray-500">
        Chargement des fermes en attente…
      </p>

      <p
        v-else-if="farms.length === 0"
        class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500"
      >
        Aucune ferme en attente. Toutes les vitrines soumises ont été traitées.
      </p>

      <article
        v-for="farm in farms"
        :key="farm.id"
        class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <img
          v-if="farm.bannerUrl"
          :src="farm.bannerUrl"
          :alt="`Bannière de ${farm.name}`"
          class="h-40 w-full object-cover"
        />
        <div
          v-else
          class="flex h-24 w-full items-center justify-center bg-green-50 text-2xl"
        >
          🌾
        </div>

        <div class="space-y-3 p-4">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-bold text-gray-900">{{ farm.name }}</h2>
            <span
              class="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
            >
              {{ farm.status }}
            </span>
          </div>

          <dl class="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-500">Adresse</dt>
              <dd class="text-gray-800">{{ farm.address }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-500">Coordonnées</dt>
              <dd class="text-gray-800">
                {{ farm.latitude.toFixed(4) }}, {{ farm.longitude.toFixed(4) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-500">Horaires</dt>
              <dd class="whitespace-pre-line text-gray-800">{{ farm.openingHours }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-500">Paiements</dt>
              <dd class="text-gray-800">
                {{ farm.paymentMethods.map(paymentMethodLabel).join(", ") || "—" }}
              </dd>
            </div>
          </dl>

          <div>
            <p class="text-xs uppercase tracking-wide text-gray-500">Description</p>
            <div
              v-if="farm.descriptionHtml"
              class="description-html mt-1 rounded border border-gray-100 bg-gray-50 p-3 text-sm text-gray-800"
              v-html="farm.descriptionHtml"
            />
            <p v-else class="mt-1 text-sm italic text-gray-500">Aucune description.</p>
          </div>

          <div>
            <p class="text-xs uppercase tracking-wide text-gray-500">
              Catalogue ({{ farm.products.length }})
            </p>
            <ul v-if="farm.products.length" class="mt-1 space-y-0.5 text-sm text-gray-800">
              <li v-for="product in farm.products" :key="product.id">
                {{ product.name }} — {{ product.unitPrice.toFixed(2) }} CHF / {{ product.unit }}
              </li>
            </ul>
            <p v-else class="mt-1 text-sm italic text-gray-500">Aucun produit.</p>
          </div>

          <div class="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              class="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
              :disabled="busyId === farm.id"
              @click="decide(farm, 'APPROVED')"
            >
              Approuver
            </button>
            <button
              type="button"
              class="rounded border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              :disabled="busyId === farm.id"
              @click="decide(farm, 'REJECTED')"
            >
              Rejeter
            </button>
          </div>
        </div>
      </article>
    </template>
  </div>
</template>
