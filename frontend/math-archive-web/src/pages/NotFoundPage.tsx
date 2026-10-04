import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { Seo } from '../seo/Seo';

export function NotFoundPage() {
  return (
    <Container maxWidth="md" className="page-section">
      <Seo
        title="Сторінку не знайдено | Математика"
        description="Запитану сторінку не знайдено. Перейдіть до навчальних матеріалів з математики."
        canonicalPath="/404"
        noIndex
      />
      <Box className="state-box math-not-found">
        <svg viewBox="0 0 240 100" aria-hidden="true" focusable="false"><path pathLength="1" d="M15 80H225 M45 90V10 M65 70Q125 5 195 60" /><circle cx="150" cy="33" r="7" /><text x="160" y="25">404</text></svg>
        <Stack gap={2} alignItems="flex-start">
          <Typography component="h1" variant="h4">Сторінку не знайдено</Typography>
          <Typography color="text.secondary">Можливо, посилання застаріло або адресу введено неправильно.</Typography>
          <Button component={Link} to="/materials" variant="contained">Переглянути матеріали</Button>
        </Stack>
      </Box>
    </Container>
  );
}
