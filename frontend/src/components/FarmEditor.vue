<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  saveMyFarm,
  paymentMethodLabel,
  type Farm,
  type PaymentMethod,
} from "../api";
import { renderRichText } from "../markdown";

const props = defineProps<{
  farm: Farm | null;
}>();

const emit = defineEmits<{
  saved: [farm: Farm];
}>();

const ALL_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "TWINT_FARM", "CARD_FARM"];

const form = reactive({
  name: "",
  address: "",
  openingHours: "",
  description: "",
  paymentMethods: ["CASH"] as PaymentMethod[],
});

const bannerFile = ref<File | null>(null);
const bannerPreview = ref<string | null>(null);
const descriptionTab = ref<"write" | "preview">("write");
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const submitting = ref(false);
const errorMsg = ref<string | null>(null);
const successMsg = ref<string | null>(null);

const isEditing = computed(() => props.farm !== null);
const previewHtml = computed(() => renderRichText(form.description));

// Pré-remplit le formulaire dès que les données de la ferme arrivent
watch(
  () => props.farm,
  (farm) => {
    if (!farm) return;
    form.name = farm.name;
    form.address = farm.address;
    form.openingHours = farm.openingHours;
    form.description = farm.description;
    form.paymentMethods = [...farm.paymentMethods];
    bannerPreview.value = farm.bannerUrl;
    bannerFile.value = null;
  },
  { immediate: true }
);

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  bannerFile.value = file;
  if (file) {
    bannerPreview.value = URL.createObjectURL(file);
  }
}

function togglePayment(method: PaymentMethod) {
  const idx = form.paymentMethods.indexOf(method);
  if (idx >= 0) {
    form.paymentMethods.splice(idx, 1);
  } else {
    form.paymentMethods.push(method);
  }
}

/** Insère la mise en forme autour du texte sélectionné dans le textarea. */
function applyFormat(prefix: string, suffix = "", placeholder = "texte") {
  descriptionTab.value = "write";
  const el = textareaRef.value;
  if (!el) {
    form.description += `${prefix}${placeholder}${suffix}`;
    return;
  }

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = form.description.slice(start, end) || placeholder;
  form.description =
    form.description.slice(0, start) +
    prefix +
    selected +
    suffix +
    form.description.slice(end);
}

async function handleSubmit() {
  errorMsg.value = null;
  successMsg.value = null;

  if (!form.name.trim()) return (errorMsg.value = "Le nom de la ferme est obligatoire.");
  if (!form.address.trim()) return (errorMsg.value = "L'adresse physique est obligatoire.");
  if (!form.openingHours.trim()) return (errorMsg.value = "Les horaires d'ouverture sont obligatoires.");
  if (!form.description.trim()) return (errorMsg.value = "La description est obligatoire.");
  if (form.paymentMethods.length === 0) {
    return (errorMsg.value = "Sélectionne au moins un moyen de paiement sur place.");
  }
  if (!isEditing.value && !bannerFile.value) {
    return (errorMsg.value = "Ajoute une photo de bannière pour créer ta vitrine.");
  }

  submitting.value = true;
  try {
    const saved = await saveMyFarm(
      {
        name: form.name,
        address: form.address,
        openingHours: form.openingHours,
        description: form.description,
        paymentMethods: form.paymentMethods,
        bannerFile: bannerFile.value,
      },
      isEditing.value
    );

    emit("saved", saved);
    successMsg.value = isEditing.value
      ? saved.status === "APPROVED"
        ? "Vitrine mise à jour et publiée immédiatement sur la carte."
        : "Vitrine mise à jour."
      : "Vitrine créée ! Elle est en attente de validation par l'administrateur.";
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Erreur lors de l'enregistrement.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="rounded-lg border border-gray-200 bg-white p-6 text-left shadow-sm">
    <h2 class="mb-1 text-xl font-bold text-gray-900">
      {{ isEditing ? "Ma vitrine" : "Créer ma vitrine" }}
    </h2>
    <p class="mb-5 text-sm text-gray-500">
      Ces informations apparaîtront sur ta fiche publique une fois la ferme approuvée.
    </p>

    <form class="space-y-5" @submit.prevent="handleSubmit" novalidate>
      <div
        v-if="errorMsg"
        role="alert"
        class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {{ errorMsg }}
      </div>
      <div
        v-if="successMsg"
        role="status"
        class="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900"
      >
        {{ successMsg }}
      </div>

      <!-- 1. Photo de bannière -->
      <div>
        <label for="farm-banner" class="mb-1 block text-sm font-medium text-gray-800">
          Photo de bannière <span v-if="!isEditing" class="text-red-600">*</span>
        </label>
        <div
          v-if="bannerPreview"
          class="mb-2 overflow-hidden rounded-lg border border-gray-200"
        >
          <img
            :src="bannerPreview"
            alt="Aperçu de la bannière"
            class="h-48 w-full object-cover"
          />
        </div>
        <div
          v-else
          class="mb-2 flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-green-50/50 text-sm text-gray-500"
        >
          Aucune photo sélectionnée
        </div>
        <input
          id="farm-banner"
          type="file"
          accept="image/*"
          class="block w-full text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-green-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-green-800 hover:file:bg-green-100"
          @change="onFileChange"
        />
      </div>

      <!-- 2. Nom & Adresse -->
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="farm-name" class="mb-1 block text-sm font-medium text-gray-800">
            Nom de la ferme <span class="text-red-600">*</span>
          </label>
          <input
            id="farm-name"
            v-model="form.name"
            type="text"
            placeholder="Ex. Ferme des Vergers"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none"
          />
        </div>

        <div>
          <label for="farm-address" class="mb-1 block text-sm font-medium text-gray-800">
            Adresse physique <span class="text-red-600">*</span>
          </label>
          <input
            id="farm-address"
            v-model="form.address"
            type="text"
            placeholder="Ex. Route du Coteau 12, 1700 Fribourg"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none"
          />
          <p class="mt-1 text-xs text-gray-500">
            Placée automatiquement sur la carte sans partage GPS.
          </p>
        </div>
      </div>

      <!-- 3. Section de texte riche (Option 1 : barre d'outils + aperçu) -->
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label for="farm-desc" class="text-sm font-medium text-gray-800">
            Présentation de la ferme <span class="text-red-600">*</span>
          </label>
          <div class="flex rounded border border-gray-300 text-xs">
            <button
              type="button"
              class="px-2.5 py-1"
              :class="descriptionTab === 'write' ? 'bg-gray-100 font-semibold' : 'text-gray-600'"
              @click="descriptionTab = 'write'"
            >
              Écrire
            </button>
            <button
              type="button"
              class="border-l border-gray-300 px-2.5 py-1"
              :class="descriptionTab === 'preview' ? 'bg-gray-100 font-semibold' : 'text-gray-600'"
              @click="descriptionTab = 'preview'"
            >
              Aperçu
            </button>
          </div>
        </div>

        <!-- Barre d'outils -->
        <div
          v-if="descriptionTab === 'write'"
          class="flex flex-wrap gap-1 rounded-t border border-b-0 border-gray-300 bg-gray-50 px-2 py-1.5 text-xs"
        >
          <button
            type="button"
            class="rounded border border-gray-300 bg-white px-2 py-0.5 font-bold hover:bg-gray-100"
            title="Mettre en gras"
            @click="applyFormat('**', '**', 'mot en gras')"
          >
            G
          </button>
          <button
            type="button"
            class="rounded border border-gray-300 bg-white px-2 py-0.5 italic hover:bg-gray-100"
            title="Mettre en italique"
            @click="applyFormat('*', '*', 'mot en italique')"
          >
            I
          </button>
          <button
            type="button"
            class="rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-100"
            title="Ajouter un sous-titre"
            @click="applyFormat('\n## ', '\n', 'Notre savoir-faire')"
          >
            Titre
          </button>
          <button
            type="button"
            class="rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-100"
            title="Ajouter une liste à puces"
            @click="applyFormat('\n- ', '', 'Produit de saison')"
          >
            • Liste
          </button>
        </div>

        <textarea
          v-if="descriptionTab === 'write'"
          id="farm-desc"
          ref="textareaRef"
          v-model="form.description"
          rows="5"
          placeholder="Présentez votre exploitation, vos pratiques et vos spécialités..."
          class="w-full rounded-b border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none"
        />

        <div
          v-else
          class="min-h-[120px] rounded border border-gray-300 bg-gray-50/50 p-3 text-sm text-gray-800"
        >
          <div v-if="previewHtml" v-html="previewHtml" />
          <p v-else class="italic text-gray-400">Rien à prévisualiser pour l'instant.</p>
        </div>
      </div>

      <!-- 4. Horaires d'ouverture -->
      <div>
        <label for="farm-hours" class="mb-1 block text-sm font-medium text-gray-800">
          Horaires d'ouverture <span class="text-red-600">*</span>
        </label>
        <textarea
          id="farm-hours"
          v-model="form.openingHours"
          rows="3"
          placeholder="Mercredi : 14h00 – 18h00&#10;Samedi : 08h30 – 12h30"
          class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none"
        />
        <p class="mt-1 text-xs text-gray-500">
          Une ligne par jour : les retours à la ligne sont conservés sur ta fiche publique.
        </p>
      </div>

      <!-- 5. Moyens de paiement sur place (C2-F2) -->
      <fieldset class="rounded border border-gray-200 p-4">
        <legend class="px-1 text-sm font-medium text-gray-800">
          Paiements acceptés à la ferme <span class="text-red-600">*</span>
        </legend>
        <div class="mt-1 flex flex-wrap gap-4">
          <label
            v-for="method in ALL_PAYMENT_METHODS"
            :key="method"
            class="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              :checked="form.paymentMethods.includes(method)"
              @change="togglePayment(method)"
            />
            <span>{{ paymentMethodLabel(method) }}</span>
          </label>
        </div>
        <p class="mt-2 text-xs text-gray-500">
          Règlement direct lors du retrait, 0 % de commission.
        </p>
      </fieldset>

      <div class="flex justify-end">
        <button
          type="submit"
          :disabled="submitting"
          class="rounded bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {{
            submitting
              ? "Enregistrement..."
              : isEditing
                ? "Enregistrer les modifications"
                : "Créer ma vitrine"
          }}
        </button>
      </div>
    </form>
  </section>
</template>