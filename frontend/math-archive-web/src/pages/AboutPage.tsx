import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { Box, Container, Grid, Stack, Typography } from '@mui/material';

const materialItems = [
  'конспекти уроків',
  'презентації',
  'самостійні роботи',
  'контрольні роботи',
  'дидактичні матеріали',
  'картки із завданнями',
  'інші навчальні ресурси'
];

export function AboutPage() {
  return (
    <Box component="section" className="about-archive-section about-page-section">
      <Container maxWidth="lg">
        <Grid container spacing={3} alignItems="stretch">
          <Grid size={{ xs: 12, md: 6 }}>
            <Box className="about-feature about-feature-main">
              <Box className="feature-icon"><AutoStoriesOutlinedIcon /></Box>
              <Typography variant="h3">Про MathArchive</Typography>
              <Stack gap={1.5} color="text.secondary">
                <Typography>
                  MathArchive — сучасна платформа для зручного зберігання, впорядкування та поширення навчальних матеріалів з математики.
                </Typography>
                <Typography>
                  Вона створена для вчителів, учнів і батьків, щоб зробити доступ до навчальних ресурсів простим, швидким і зручним.
                </Typography>
                <Typography>На платформі можна знайти:</Typography>
              </Stack>
              <Box component="ul" className="materials-list">
                {materialItems.map((item) => <li key={item}>{item}</li>)}
              </Box>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack gap={3} height="100%">
              <Box className="about-feature">
                <Box className="feature-icon sage"><VerifiedOutlinedIcon /></Box>
                <Typography variant="h4">Якісні матеріали від практикуючого вчителя</Typography>
                <Typography color="text.secondary">
                  Усі матеріали на платформі публікуються та впорядковуються практикуючим учителем математики з багаторічним педагогічним досвідом.
                </Typography>
                <Typography color="text.secondary">
                  Завдяки цьому вони відповідають навчальній програмі, є актуальними, зрозумілими та готовими до використання на уроках і під час самостійного навчання.
                </Typography>
              </Box>
              <Box className="about-feature compact">
                <Box className="feature-icon blue"><DevicesOutlinedIcon /></Box>
                <Typography variant="h4">Сучасна платформа</Typography>
                <Typography color="text.secondary">
                  MathArchive поєднує педагогічний досвід із сучасними вебтехнологіями, забезпечуючи швидкий пошук, зручну навігацію та комфортний доступ до навчальних матеріалів із будь-якого пристрою.
                </Typography>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
