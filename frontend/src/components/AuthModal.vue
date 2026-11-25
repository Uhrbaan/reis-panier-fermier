<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { fetchDemoAccounts, login, register, type DemoAccount } from "../api";
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

/**
 * Seeded accounts for one-click sign-in (`GET /api/demo/accounts`).
 *
 * Empty outside development, because the endpoint does not exist there — the
 * panel below then renders nothing at all. The credentials are never hardcoded
 * in this file: doing so would ship them inside the public production bundle.
 */
const demoAccounts = ref<DemoAccount[]>([]);
const demoOpen = ref(true);
const demoPendingEmail = ref<string | null>(null);

onMounted(async () => {
  demoAccounts.value = await fetchDemoAccounts();
});

/** Fill the form and sign in immediately, so a demo is a single click. */
async function loginAs(account: DemoAccount) {
  errorMsg.value = null;
  demoPendingEmail.value = account.email;
  pending.value = true;

  try {
    const session = await login(account.email, account.password);
    setSession(session.token, session.user);
    form.password = "";
    emit("authenticated", session.user);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Authentification impossible.";
  } finally {
    pending.value = false;
    demoPendingEmail.value = null;
  }
}

const roleLabels: Record<DemoAccount["role"], string> = {
  ADMIN: "Admin",
  CLIENT: "Client",
  FARMER: "Producteur",
};

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

    <!-- Comptes de démonstration : présents uniquement hors production. -->
    <section v-if="demoAccounts.length > 0" class="mt-6 border-t border-dashed border-gray-300 pt-4">
      <button
        type="button"
        class="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
        @click="demoOpen = !demoOpen"
      >
        <span>Comptes de démo (dev)</span>
        <span>{{ demoOpen ? "−" : "+" }}</span>
      </button>

      <ul v-if="demoOpen" class="mt-2 space-y-2">
        <li v-for="account in demoAccounts" :key="account.email">
          <button
            type="button"
            class="flex w-full flex-col rounded border border-gray-200 px-3 py-2 text-left text-sm hover:border-green-600 hover:bg-green-50 disabled:opacity-50"
            :disabled="pending"
            @click="loginAs(account)"
          >
            <span class="font-semibold text-gray-900">
              {{ roleLabels[account.role] }} — {{ account.name }}
              <span v-if="demoPendingEmail === account.email" class="text-xs font-normal">…</span>
            </span>
            <span class="text-xs text-gray-500">{{ account.hint }}</span>
            <span class="text-xs text-gray-400">{{ account.email }}</span>
          </button>
        </li>
      </ul>

      <p v-if="demoOpen" class="mt-2 text-xs text-gray-400">
        Bouton disponible seulement en développement : ces comptes n'existent pas en production.
      </p>
    </section>
  </section>
</template>
