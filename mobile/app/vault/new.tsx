import { useRouter } from 'expo-router';
import { useState } from 'react';
import { VaultItemForm, type VaultItemFormValues } from '@/components/VaultItemForm';
import { Screen } from '@/components/Screen';
import { useCreateVaultItem } from '@/hooks/useVaultItems';
import { useLocalCouple } from '@/hooks/useCouple';
import { useAuthStore } from '@/stores/authStore';

export default function NewVaultItemScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const createVaultItem = useCreateVaultItem();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: VaultItemFormValues) => {
    if (!data?.couple || !user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await createVaultItem(
        data.couple.id,
        {
          title: values.title,
          username: values.username?.trim() || null,
          password: values.password ?? '',
          websiteUrl: values.websiteUrl?.trim() || null,
          category: values.category,
          notes: values.notes?.trim() || null,
        },
        user.id,
      );
      router.back();
    } catch {
      // Local writes don't fail for network reasons (they're pure SQLite) — a genuine unexpected error.
      setError('Could not save this password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <VaultItemForm
        initialValues={{ title: '', username: '', password: '', websiteUrl: '', category: 'Other', notes: '' }}
        passwordRequired
        submitLabel="Save Password"
        isSubmitting={isSubmitting}
        serverError={error}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
