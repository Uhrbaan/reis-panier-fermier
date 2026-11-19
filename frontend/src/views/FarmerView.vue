<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getUser, getToken, setSession, clearSession, callProtected, authHeaders } from "../auth";
import { fetchApprovedFarms } from "../api";

const serverMsg = ref("Chargement...");
const currentUser = ref(getUser());
const token = ref(getToken());

// Dev-only helper: paste an e-mail, mint a token with the backend script, paste it here.
const email = ref("marc@example.ch");
const pastedToken = ref("");
const notice = ref<string | null>(null);

async function load() {
  const result = await callProtected<{ message?: string; error?: string }>("/api/farmer/hello");
  if (result.body?.message) {
    serverMsg.value = result.body.message;
  } else {
    serverMsg.value = `${result.status} ${result.body?.error ?? ""} — connecte-toi avec un compte FARMER.`;
  }
}

async function applyToken() {
  notice.value = null;
  const value = pastedToken.value.trim();
  if (!value) return;
  setSession(value, currentUser.value ?? { id: 0, name: "", email: email.value, role: "CLIENT" });
  token.value = value;
  await load();
}

/** Prove the browser can read the DB-backed farm list (public endpoint). */
async function checkFarms() {
  try {
    const farms = await fetchApprovedFarms();
    notice.value = `${farms.length} ferme(s) approuvée(s) en base : ${farms
      .map((f) => f.name)
      .join(", ")}`;
  } catch (err) {
    notice.value = `Erreur liste fermes : ${err instanceof Error ? err.message : "inconnue"}`;
  }
}

function logout() {
  clearSession();
  token.value = null;
  currentUser.value = null;
  serverMsg.value = "Session effacée.";
}

onMounted(load);
const probeHeaders = () => JSON.stringify(authHeaders());
</script>

<template>
  <div style="padding: 20px; border: 2px solid green; border-radius: 8px; margin: 16px;">
    <h1>Hello Producteur ! (T1.2 — vérification JWT)</h1>
    <p><strong>Réponse du serveur :</strong> {{ serverMsg }}</p>

    <hr class="my-4" />

    <p class="text-sm">
      <strong>Jeton en session :</strong>
      <code v-if="token" class="break-all text-xs">{{ token.slice(0, 40) }}…</code>
      <span v-else class="italic text-gray-500">aucun</span>
    </p>

    <div v-if="!token" class="mt-3 space-y-2">
      <label class="block text-sm">
        Compte cible :
        <input v-model="email" class="ml-1 rounded border px-2 py-1 text-sm" />
      </label>
      <p class="text-xs text-gray-600">
        Génère un jeton côté backend :
        <code class="rounded bg-gray-100 px-1">cd backend &amp;&amp; npm run token -- {{ email }}</code>
      </p>
      <label class="block text-sm">
        Jeton :
        <textarea
          v-model="pastedToken"
          rows="2"
          class="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
          placeholder="eyJhbGciOi..."
        ></textarea>
      </label>
      <button
        type="button"
        class="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        @click="applyToken"
      >
        Utiliser ce jeton
      </button>
    </div>

    <div v-else class="mt-3 space-y-2">
      <button
        type="button"
        class="mr-2 rounded border border-gray-400 px-3 py-1 text-sm"
        @click="load"
      >
        Re-tester /api/farmer/hello
      </button>
      <button
        type="button"
        class="mr-2 rounded border border-gray-400 px-3 py-1 text-sm"
        @click="checkFarms"
      >
        Tester /api/client/farms
      </button>
      <button type="button" class="rounded border border-red-400 px-3 py-1 text-sm" @click="logout">
        Se déconnecter
      </button>
      <details class="text-xs text-gray-600">
        <summary class="cursor-pointer">En-têtes envoyés</summary>
        <code class="break-all">{{ probeHeaders() }}</code>
      </details>
    </div>

    <p v-if="notice" class="mt-3 rounded bg-gray-100 p-2 text-sm">{{ notice }}</p>
  </div>
</template>
