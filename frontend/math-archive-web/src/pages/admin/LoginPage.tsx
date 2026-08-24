import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Container, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getApiErrorMessage, isApiError } from '../../api/apiErrors';
import { login } from '../../api/authApi';
import { Seo } from '../../seo/Seo';

const schema = z.object({
  username: z.string().min(1, 'Введіть логін'),
  password: z.string().min(1, 'Введіть пароль')
});

type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<LoginForm>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } });

  const submit = form.handleSubmit(async (values) => {
    setError('');
    try {
      await login(values.username, values.password);
      const next = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/admin/documents';
      navigate(next, { replace: true });
    } catch (error) {
      setError(isApiError(error) && error.status === 401 ? 'Неправильний логін або пароль' : getApiErrorMessage(error));
    }
  });

  return (
    <Container maxWidth="sm" className="login-page">
      <Seo title="Вхід до панелі керування | MathArchive" description="Вхід адміністратора." canonicalPath="/admin/login" noIndex />
      <Box component="form" className="content-panel" onSubmit={submit}>
        <Stack gap={2}>
          <Typography variant="h4">Вхід до панелі керування</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Логін" {...form.register('username')} error={!!form.formState.errors.username} helperText={form.formState.errors.username?.message} />
          <TextField label="Пароль" type="password" {...form.register('password')} error={!!form.formState.errors.password} helperText={form.formState.errors.password?.message} />
          <Button type="submit" variant="contained">Увійти</Button>
        </Stack>
      </Box>
    </Container>
  );
}
