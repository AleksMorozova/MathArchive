import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArchitectureOutlinedIcon from '@mui/icons-material/ArchitectureOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import FunctionsOutlinedIcon from '@mui/icons-material/FunctionsOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { Seo } from '../seo/Seo';
import { homeSeo } from '../seo/seoConfig';

const classLinks = [
  { label: '5 клас', to: '/materials?class=5', icon: <MenuBookOutlinedIcon fontSize="small" /> },
  { label: '6 клас', to: '/materials?class=6', icon: <ViewInArOutlinedIcon fontSize="small" /> },
  { label: '7 клас', to: '/materials?class=7', icon: <ArchitectureOutlinedIcon fontSize="small" /> },
  { label: '8 клас', to: '/materials?class=8', icon: <SquareFootOutlinedIcon fontSize="small" /> },
  { label: '9 клас', to: '/materials?class=9', icon: <QueryStatsOutlinedIcon fontSize="small" /> },
  { label: '10 клас', to: '/materials?class=10', icon: <FunctionsOutlinedIcon fontSize="small" /> },
  { label: '11 клас', to: '/materials?class=11', icon: <CalculateOutlinedIcon fontSize="small" /> },
  { label: 'Загальні матеріали', to: '/materials?class=general', icon: <StarBorderOutlinedIcon fontSize="small" /> }
];

export function HomePage() {
  return (
    <Container maxWidth="lg">
      <Seo {...homeSeo} />
      <Box className="hero">
        <Stack gap={3} className="hero-copy">
          <Box className="teacher-introduction">
            <Typography variant="h1">Морозова Тетяна Володимирівна</Typography>
            <Typography component="p" variant="h5" className="teacher-experience">
              Вчитель математики з понад 30-річним досвідом
            </Typography>
            <Typography component="p" color="text.secondary" className="teacher-workplace">
              Ліцей №23 «Соборний» ДМР
            </Typography>
          </Box>
          <Box className="hero-materials-summary">
            <Typography component="h2" variant="h5">Навчальні матеріали з математики</Typography>
            <Typography color="text.secondary">
              Формули, контрольні та самостійні роботи, пам’ятки й методичні матеріали для учнів і вчителів.
            </Typography>
          </Box>
          <Button component={Link} to="/materials" variant="contained" size="large" endIcon={<ArrowForwardIcon />}>
            Переглянути матеріали
          </Button>
        </Stack>
        <Box className="class-navigation-card" aria-label="Навігація за класом">
          <Box className="class-link-grid">
            {classLinks.map((item) => (
              <Box key={item.to} component={Link} to={item.to} className="class-link-tile">
                {item.icon}
                <Typography variant="h6">{item.label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Container>
  );
}
