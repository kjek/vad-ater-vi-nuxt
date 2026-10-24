<template>
  <UHeader
    title="Lunch i Sundsvall"
    :toggle="false"
  >
    <template #title>
      <AppLogo class="h-6 w-auto shrink-0" />
      <h1>Lunch i Sundsvall</h1>
    </template>

    <template #right>
      <UColorModeButton />

      <UDropdownMenu :items="items">
        <UButton
          icon="i-lucide-menu"
          color="neutral"
          variant="outline"
        />
      </UDropdownMenu>
    </template>
  </UHeader>
  <RestaurantAddModal
    v-model:open="restaurantAddModalOpen"
    @add-restaurant="onCreateNewRestaurant"
  />
  <MetadataEditModal v-model:open="editMetadataModalOpen" />
</template>

<script lang="ts" setup>
import type { DropdownMenuItem } from '@nuxt/ui';
import type { CreateRestaurantConfig } from '~~/server/types/restaurant-config';

const restaurantAddModalOpen = ref<boolean>(false);
const editMetadataModalOpen = ref<boolean>(false);

const { signOut } = useAuth();
const restaurantConfigsStore = useRestaurantConfigsStore();
const { createNewRestaurant } = restaurantConfigsStore;

const onScrapeAll = async () => {
  await useToastFetch('/api/scrapers', { method: 'POST' });
};

const onCreateNewRestaurant = async (payload: CreateRestaurantConfig) => {
  await createNewRestaurant(payload);
  restaurantAddModalOpen.value = false;
};

const onAddPasskey = async () => {
  await usePKRegister();
};

const onLogout = async () => {
  await signOut({ callbackUrl: '/login' });
};

const items = ref<DropdownMenuItem[][]>([
  [
    {
      label: 'Settings',
      icon: 'i-lucide-cog',
      kbds: [','],
      children: [
        [
          {
            label: 'Re-scrape restaurants',
            icon: 'i-lucide-refresh-cw',
            onSelect: onScrapeAll,
          },
          {
            label: 'Add restaurant',
            icon: 'i-lucide-circle-plus',
            onSelect: () => (restaurantAddModalOpen.value = true),
          },
        ],
        [
          {
            label: 'Edit ignored metadata',
            icon: 'i-lucide-edit',
            onSelect: () => (editMetadataModalOpen.value = true),
          },
        ],
      ],
    },
    {
      label: 'Add passkey',
      icon: 'i-lucide-key-round',
      onSelect: onAddPasskey,
    },
  ],
  [
    {
      label: 'Logout',
      icon: 'i-lucide-log-out',
      color: 'error',
      kbds: ['shift', 'meta', 'q'],
      onSelect: onLogout,
    },
  ],
]);
</script>
