<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getUser, getToken, setSession, clearSession, callProtected } from "../auth";

const serverMsg = ref("Chargement...");
const token = ref(getToken());
const email = ref("sophie@example.ch");
const pastedToken = ref("");

async function load() {
  const result = await callProtected<{ message?: string; error?: string }>("/api/admin/hello");
  if (result.body?.message) {
    serverMsg.value = result.body.message;
  } else {
    serverMsg.value = `${result.status} ${result.body?.error ?? ""} — un jeton ADMIN est requis.`;
  }
}

async function applyToken() {
  const value = pastedToken.value.trim();
  if (!value) return;
  setSession(value, getUser() ?? { id: 0, name: "", email: email.value, role: "ADMIN" });
  token.value = value;
  await load();
}

function logout() {
  clearSession();
  token.value = null;
  serverMsg.value = "Session effacée.";
}

onMounted(load);
</script>

<template>
  <div style="padding: 20px; border: 2px solid green; border-radius: 8px; margin: 16px;">
    <h1>Hello Admin (T1.2 — vérification JWT)</h1>
    <p><strong>Réponse du serveur :</strong> {{ serverMsg }}</p>

    <hr class="my-4" />

    <div v-if="!token" class="space-y-2">
      <p class="text-sm">
        Génère un jeton admin :
        <code class="rounded bg-gray-100 px-1">cd backend &amp;&amp; npm run token -- sophie@example.ch</code>
      </p>
      <textarea
        v-model="pastedToken"
        rows="2"
        class="w-full rounded border px-2 py-1 font-mono text-xs"
        placeholder="eyJhbGciOi..."
      ></textarea>
      <button
        type="button"
        class="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        @click="applyToken"
      >
        Utiliser ce jeton
      </button>
    </div>

    <div v-else class="space-y-2">
      <button type="button" class="mr-2 rounded border border-gray-400 px-3 py-1 text-sm" @click="load">
        Re-tester /api/admin/hello
      </button>
      <button type="button" class="rounded border border-red-400 px-3 py-1 text-sm" @click="logout">
        Se déconnecter
      </button>
    </div>
  </div>
</template>
