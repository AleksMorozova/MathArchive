import { Box, Container, Typography } from '@mui/material';

export function AboutPage() {
  return (
    <Container maxWidth="md">
      <Box className="content-panel">
        <Typography variant="h3" gutterBottom>Про сайт</Typography>
        <Typography color="text.secondary">
          MathArchive допомагає швидко знаходити навчальні матеріали з математики для різних класів, тем і типів занять.
        </Typography>
      </Box>
    </Container>
  );
}
