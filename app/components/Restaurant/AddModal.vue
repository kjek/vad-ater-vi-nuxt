<template>
  <SettingsItemContent>
    <template #right>
      <UModal
        v-model:open="open"
        title="Add Restaurant"
        description="Create a new restaurant entry for the page. Name and the URL's are mandatory"
      >
        <template #body>
          <UForm
            :validate="validate"
            :state
            class="space-y-4"
            @submit.prevent="onSubmit"
          >
            <UPageList class="gap-4">
              <UFormField
                label="Name"
                name="name"
              >
                <UInput v-model="state.name" />
              </UFormField>
              <UFormField
                label="Homepage URL"
                name="homepage-url"
              >
                <UInput v-model="state.homeUrl" />
              </UFormField>
              <UFormField
                label="Lunch menu URL"
                name="lunch-url"
              >
                <UInput v-model="state.lunchUrl" />
              </UFormField>
              <UFormField
                label="Enabled upon creation"
                name="enabled"
              >
                <UButton
                  :label="state.enabled ? 'Enabled' : 'Disabled'"
                  :color="state.enabled ? 'primary' : 'error'"
                  variant="outline"
                  @click="toggleEnabled"
                />
              </UFormField>
              <div class="flex self-end">
                <UButton
                  label="Create"
                  type="submit"
                  color="primary"
                  variant="outline"
                />
              </div>
            </UPageList>
          </UForm>
        </template>
      </UModal>
    </template>
  </SettingsItemContent>
</template>

<script lang="ts" setup>
import type { FormError } from '@nuxt/ui';
import type { CreateRestaurantConfig } from '~~/server/types/restaurant-config';

interface Emits {
  (e: 'addRestaurant', restaurantSetting: CreateRestaurantConfig): void;
}

const emit = defineEmits<Emits>();
const open = defineModel<boolean>('open', { required: true });

const state = reactive<Partial<CreateRestaurantConfig>>({
  name: undefined,
  homeUrl: undefined,
  lunchUrl: undefined,
  enabled: false,
});

const toggleEnabled = () => {
  state.enabled = !state.enabled;
};

const validate = (state: CreateRestaurantConfig): FormError[] => {
  const errors = [];
  if (!state.name) errors.push({ name: 'name', message: 'Required' });
  if (!state.homeUrl) errors.push({ name: 'homepage-url', message: 'Required' });
  if (!state.lunchUrl) errors.push({ name: 'lunch-url', message: 'Required' });
  return errors;
};

const onSubmit = async () => {
  emit('addRestaurant', { ...state } as CreateRestaurantConfig);
  Object.keys(state).forEach((key) => {
    state[key as keyof typeof state] = undefined;
  });
};
</script>

<style></style>
