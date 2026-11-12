<template>
  <div style="font-family: sans-serif; max-width: 700px; margin: 20px auto;">
    <nav style="display: flex; gap: 15px; background: #f4f4f4; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
      <router-link to="/">Interface Client (/)</router-link>
      <router-link to="/producteur">Interface Producteur (/producteur)</router-link>
      <router-link to="/admin">Interface Admin (/admin)</router-link>
    </nav>
    <router-view />
    <p>Petit exemple pour montrer le routage pour 3 groupes d'utilisateurs différents, les clients, producteurs et administrateurs.</p>
  </div>
</template>