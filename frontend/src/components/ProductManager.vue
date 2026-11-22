<script setup lang="ts">
import { reactive, ref } from "vue";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  type Product,
} from "../api";

const props = defineProps<{
  products: Product[];
}>();

const emit = defineEmits<{
  updated: [products: Product[]];
}>();

const newItem = reactive({
  name: "",
  unit: "kg",
  unitPrice: "",
});

const editingId = ref<number | null>(null);
const editItem = reactive({
  name: "",
  unit: "",
  unitPrice: "",
});

const busy = ref(false);
const errorMsg = ref<string | null>(null);

async function handleAdd() {
  errorMsg.value = null;
  const price = Number(newItem.unitPrice);

  if (!newItem.name.trim()) return (errorMsg.value = "Indique le nom du produit.");
  if (!newItem.unit.trim()) return (errorMsg.value = "Indique l'unité (ex. kg, pièce, pot).");
  if (!Number.isFinite(price) || price < 0) {
    return (errorMsg.value = "Le prix unitaire doit être un nombre positif.");
  }

  busy.value = true;
  try {
    const created = await createProduct({
      name: newItem.name.trim(),
      unit: newItem.unit.trim(),
      unitPrice: price,
    });
    emit("updated", [...props.products, created]);
    newItem.name = "";
    newItem.unit = "kg";
    newItem.unitPrice = "";
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Ajout impossible.";
  } finally {
    busy.value = false;
  }
}

function startEdit(product: Product) {
  errorMsg.value = null;
  editingId.value = product.id;
  editItem.name = product.name;
  editItem.unit = product.unit;
  editItem.unitPrice = String(product.unitPrice);
}

function cancelEdit() {
  editingId.value = null;
}

async function handleSaveEdit(productId: number) {
  errorMsg.value = null;
  const price = Number(editItem.unitPrice);

  if (!editItem.name.trim() || !editItem.unit.trim() || !Number.isFinite(price) || price < 0) {
    return (errorMsg.value = "Vérifie le nom, l'unité et le prix.");
  }

  busy.value = true;
  try {
    const updated = await updateProduct(productId, {
      name: editItem.name.trim(),
      unit: editItem.unit.trim(),
      unitPrice: price,
    });
    emit(
      "updated",
      props.products.map((p) => (p.id === productId ? updated : p))
    );
    editingId.value = null;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Modification impossible.";
  } finally {
    busy.value = false;
  }
}

async function handleDelete(productId: number) {
  errorMsg.value = null;
  busy.value = true;
  try {
    await deleteProduct(productId);
    emit(
      "updated",
      props.products.filter((p) => p.id !== productId)
    );
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Suppression impossible.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="rounded-lg border border-gray-200 bg-white p-6 text-left shadow-sm">
    <h2 class="mb-1 text-xl font-bold text-gray-900">Mon catalogue produits</h2>
    <p class="mb-4 text-sm text-gray-500">
      Aucun stock à gérer : tu pourras retirer un article manquant au moment de valider chaque panier.
    </p>

    <div
      v-if="errorMsg"
      role="alert"
      class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      {{ errorMsg }}
    </div>

    <!-- Formulaire d'ajout rapide -->
    <form
      class="mb-6 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-12"
      @submit.prevent="handleAdd"
    >
      <input
        v-model="newItem.name"
        type="text"
        placeholder="Nom (ex. Tomates cœur de bœuf)"
        class="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm sm:col-span-5"
      />
      <input
        v-model="newItem.unit"
        type="text"
        placeholder="Unité (kg, pot, pièce)"
        class="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm sm:col-span-3"
      />
      <input
        v-model="newItem.unitPrice"
        type="number"
        step="0.05"
        min="0"
        placeholder="Prix CHF"
        class="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm sm:col-span-2"
      />
      <button
        type="submit"
        :disabled="busy"
        class="rounded bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50 sm:col-span-2"
      >
        + Ajouter
      </button>
    </form>

    <!-- Liste des produits -->
    <p v-if="products.length === 0" class="text-sm italic text-gray-500">
      Aucun produit dans ton catalogue pour le moment.
    </p>

    <table v-else class="w-full border-collapse text-sm">
      <thead>
        <tr class="border-b border-gray-200 text-left text-gray-600">
          <th class="py-2">Produit</th>
          <th class="py-2">Unité</th>
          <th class="py-2">Prix (CHF)</th>
          <th class="py-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="product in products"
          :key="product.id"
          class="border-b border-gray-100"
        >
          <template v-if="editingId === product.id">
            <td class="py-2 pr-2">
              <input
                v-model="editItem.name"
                type="text"
                class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </td>
            <td class="py-2 pr-2">
              <input
                v-model="editItem.unit"
                type="text"
                class="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </td>
            <td class="py-2 pr-2">
              <input
                v-model="editItem.unitPrice"
                type="number"
                step="0.05"
                min="0"
                class="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </td>
            <td class="py-2 text-right whitespace-nowrap">
              <button
                type="button"
                :disabled="busy"
                class="mr-2 font-medium text-green-700 hover:underline"
                @click="handleSaveEdit(product.id)"
              >
                Valider
              </button>
              <button
                type="button"
                class="text-gray-500 hover:underline"
                @click="cancelEdit"
              >
                Annuler
              </button>
            </td>
          </template>

          <template v-else>
            <td class="py-2.5 font-medium text-gray-900">{{ product.name }}</td>
            <td class="py-2.5 text-gray-600">{{ product.unit }}</td>
            <td class="py-2.5">{{ product.unitPrice.toFixed(2) }} CHF</td>
            <td class="py-2.5 text-right whitespace-nowrap">
              <button
                type="button"
                class="mr-3 text-green-700 hover:underline"
                @click="startEdit(product)"
              >
                Modifier
              </button>
              <button
                type="button"
                :disabled="busy"
                class="text-red-600 hover:underline"
                @click="handleDelete(product.id)"
              >
                Supprimer
              </button>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </section>
</template>