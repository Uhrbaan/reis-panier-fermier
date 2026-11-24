<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { login, register } from "../api";
import { setSession, type SessionUser } from "../auth";

/**
 * Login / registration modal (`T1.3`).
 *
 * Emits `authenticated` with the opened session so the parent view can react
 * (e.g. reload the producer's storefront). The token itself is stored by
 * `setSession`, never held in a component ref.
 */

const emit = defineEmits<{
  authenticated: [user: SessionUser];
}>();

const props = defineProps<{
  /** Which tab to open on mount. */
  initialMode?: "login" | "register";
  /** Restricts registration to a role (used by the producer area). */
  forcedRole?: "CLIENT" | "FARMER";
}>();

const mode = ref<"login" | "register">(props.initialMode ?? "login");

const form = reactive({
  name: "",
  email: "",
  password: "",
  role: (props.forcedRole ?? "CLIENT") as "CLIENT" | "FARMER",
});

const pending = ref(false);
const errorMsg = ref<string | null>(null);

const isRegister = computed(() => mode.value === "register");

const title = computed(() =>
  isRegister.value ? "Créer un compte" : "Se connecter"
);

function switchMode(next: "login" | "register") {
  mode.value = next;
  errorMsg.value = null;
}

async function submit() {
  errorMsg.value = null;

  if (!form.email.trim()) {
    errorMsg.value = "Indique ton adresse e-mail.";
    return;
  }
  if (!form.password) {
    errorMsg.value = "Indique ton mot de passe.";
    return;
  }
  if (isRegister.value && !form.name.trim()) {
    errorMsg.value = "Indique ton nom.";
    return;
  }

  pending.value = true;
  try {
    const session = isRegister.value
      ? await register({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        })
      : await login(form.email.trim(), form.password);

    setSession(session.token, session.user);
    form.password = "";
    emit("authenticated", session.user);
  } catch (err) {
    errorMsg.value =
      err instanceof Error ? err.message : "Authentification impossible.";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6 text-left shadow-sm">
    <h2 class="mb-1 text-xl font-bold text-gray-900">{{ title }}</h2>
    <p class="mb-5 text-sm text-gray-500">
      {{
        isRegister
          ? "Un compte suffit pour demander des paniers ou vendre tes produits."
          : "Connecte-toi pour accéder à ton espace."
      }}
    </p>

    <div class="mb-5 flex rounded border border-gray-300 text-sm">
      <button
        type="button"
        class="flex-1 px-3 py-1.5"
        :class="mode === 'login' ? 'bg-gray-100 font-semibold' : 'text-gray-600'"
        @click="switchMode('login')"
      >
        Se connecter
      </button>
      <button
        type="button"
        class="flex-1 border-l border-gray-300 px-3 py-1.5"
        :class="mode === 'register' ? 'bg-gray-100 font-semibold' : 'text-gray-600'"
        @click="switchMode('register')"
      >
        Créer un compte
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="submit" novalidate>
      <div
        v-if="errorMsg"
        role="alert"
        class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {{ errorMsg }}
      </div>

      <div v-if="isRegister">
        <label for="auth-name" class="mb-1 block text-sm font-medium text-gray-800">
          Nom <span class="text-red-600">*</span>
        </label>
        <input
          id="auth-name"
          v-model="form.name"
          type="text"
          autocomplete="name"
          placeholder="Ex. Marie Dupont"
          class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none"
        />
      </div>

      <div>
        <label for="auth-email" class="mb-1 block text-sm font-medium text-gray-800">
          Adresse e-mail <span class="text-red-600">*</span>
        </label>
        <input
          id="auth-email"
          v-model="form.email"
          type="email"
          autocomplete="email"
          placeholder="prenom@example.ch"
          class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none"
        />
      </div>

      <div>
        <label for="auth-password" class="mb-1 block text-sm font-medium text-gray-800">
          Mot de passe <span class="text-red-600">*</span>
        </label>
        <input
          id="auth-password"
          v-model="form.password"
          type="password"
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
          :placeholder="isRegister ? 'Au moins 8 caractères' : '••••••••'"
          class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none"
        />
        <p v-if="isRegister" class="mt-1 text-xs text-gray-500">
          Au moins 8 caractères.
        </p>
      </div>

      <fieldset v-if="isRegister && !forcedRole" class="rounded border border-gray-200 p-3">
        <legend class="px-1 text-sm font-medium text-gray-800">Je suis…</legend>
        <div class="mt-1 flex flex-wrap gap-4 text-sm">
          <label class="flex cursor-pointer items-center gap-2">
            <input v-model="form.role" type="radio" value="CLIENT" />
            <span>Client (je cherche des produits)</span>
          </label>
          <label class="flex cursor-pointer items-center gap-2">
            <input v-model="form.role" type="radio" value="FARMER" />
            <span>Producteur (je vends)</span>
          </label>
        </div>
      </fieldset>

      <p v-if="isRegister" class="text-xs text-gray-500">
        Aucune adresse personnelle ni position GPS n'est demandée (confidentialité,
        <code>C1-NF1</code>).
      </p>

      <button
        type="submit"
        :disabled="pending"
        class="w-full rounded bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
      >
        {{ pending ? "Veuillez patienter…" : isRegister ? "Créer mon compte" : "Se connecter" }}
      </button>
    </form>
  </section>
</template>
