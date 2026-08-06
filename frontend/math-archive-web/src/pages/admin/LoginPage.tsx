import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Container, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { login } from '../../api/authApi';

const schema = z.object({
  username: z.string().min(1, 'Введіть логін'),
  password: z.string().min(1, 'Введіть пароль')
});

type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<LoginForm>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } });

  const submit = form.handleSubmit(async (values) => {
    setError(false);
    try {
      await login(values.username, values.password);
      const next = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/admin/documents';
      navigate(next, { replace: true });
    } catch {
      setError(true);
    }
  });

  return (
    <Container maxWidth="sm" className="login-page">
      <Box component="form" className="content-panel" onSubmit={submit}>
        <Stack gap={2}>
          <Typography variant="h4">Вхід до панелі керування</Typography>
          {error && <Alert severity="error">Неправильний логін або пароль</Alert>}
          <TextField label="Логін" {...form.register('username')} error={!!form.formState.errors.username} helperText={form.formState.errors.username?.message} />
          <TextField label="Пароль" type="password" {...form.register('password')} error={!!form.formState.errors.password} helperText={form.formState.errors.password?.message} />
          <Button type="submit" variant="contained">Увійти</Button>
        </Stack>
      </Box>
    </Container>
  );
}
