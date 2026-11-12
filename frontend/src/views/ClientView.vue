<script setup lang="ts">
import { ref, onMounted } from "vue";

const serverMsg = ref("Chargement...");

onMounted(async () => {
  const res = await fetch("http://localhost:3000/api/client/hello");
  const data = await res.json();
  serverMsg.value = data.message;
});
</script>

<template>
  <div style="padding: 20px; border: 2px solid green; border-radius: 8px;">
    <h1>Hello Client</h1>
    <p><strong>Réponse du serveur :</strong> {{ serverMsg }}</p>
  </div>
</template>