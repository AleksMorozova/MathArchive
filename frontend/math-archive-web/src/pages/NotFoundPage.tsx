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
      <Box className="state-box">
        <Stack gap={2} alignItems="flex-start">
          <Typography component="h1" variant="h4">Сторінку не знайдено</Typography>
          <Typography color="text.secondary">Можливо, посилання застаріло або адресу введено неправильно.</Typography>
          <Button component={Link} to="/materials" variant="contained">Переглянути матеріали</Button>
        </Stack>
      </Box>
    </Container>
  );
}
