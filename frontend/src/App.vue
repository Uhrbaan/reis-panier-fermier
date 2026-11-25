<template>
  <div class="min-h-screen font-sans text-gray-900">
    <nav class="flex gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm">
      <router-link to="/" class="hover:underline">Interface Client</router-link>
      <router-link to="/mes-paniers" class="hover:underline">Mes paniers</router-link>
      <router-link to="/producteur" class="hover:underline">Interface Producteur</router-link>
      <router-link to="/producteur/commandes" class="hover:underline">Commandes reçues</router-link>
      <router-link to="/admin" class="hover:underline">Interface Admin</router-link>
    </nav>
    <router-view />
  </div>
</template>