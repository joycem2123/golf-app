import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { supabase } from '@/sync/supabase';
import { space, useColors } from '@/theme';

/**
 * Opened from an email link (clutchup://auth-callback#access_token=…): signs you straight in,
 * then goes Home. Without sign-in details it just goes to the sign-in screen.
 */
export default function AuthCallback() {
  const c = useColors();
  const url = Linking.useURL();
  const [text, setText] = useState('Signing you in…');

  useEffect(() => {
    void (async () => {
      const full = url ?? (await Linking.getInitialURL()) ?? '';
      const params = new URLSearchParams(full.split('#')[1] ?? full.split('?')[1] ?? '');
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error) return router.replace('/');
        setText('That link has expired. Sign in with your email and password.');
      }
      setTimeout(() => router.replace('/welcome'), 1200);
    })();
  }, [url]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, backgroundColor: c.brand }}>
      <ActivityIndicator color="#fff" />
      <Text style={{ color: '#fff', fontSize: 16 }}>{text}</Text>
    </View>
  );
}
