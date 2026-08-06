import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import FunctionsOutlinedIcon from '@mui/icons-material/FunctionsOutlined';
import { Box, Button, Container, Grid, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { documentTypeOptions } from '../constants/documentTypes';

export function HomePage() {
  return (
    <Container maxWidth="lg">
      <Box className="hero">
        <Stack gap={3} maxWidth={760} className="hero-copy">
          <Box className="hero-kicker">
            <FunctionsOutlinedIcon fontSize="small" />
            <Typography variant="body2">Бібліотека навчальних матеріалів</Typography>
          </Box>
          <Typography variant="h1">Навчальні матеріали з математики</Typography>
          <Typography variant="h5" color="text.secondary">
            Формули, контрольні роботи, самостійні завдання та методичні матеріали для учнів і вчителів.
          </Typography>
          <Button component={Link} to="/materials" variant="contained" size="large" endIcon={<ArrowForwardIcon />}>
            Переглянути матеріали
          </Button>
        </Stack>
      </Box>
      <Grid container spacing={2.25} className="category-grid home-category-grid">
        {documentTypeOptions.slice(0, 6).map((type) => (
          <Grid key={type.value} size={{ xs: 12, sm: 6, md: 4 }}>
            <Box className="category-tile">
              <Box className="category-icon"><AutoStoriesOutlinedIcon /></Box>
              <Typography variant="h6">{type.label}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
