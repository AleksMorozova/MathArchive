import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import FormatQuoteOutlinedIcon from '@mui/icons-material/FormatQuoteOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { Box, Container, Grid, Stack, Typography } from '@mui/material';
import { Seo } from '../seo/Seo';
import { aboutSeo } from '../seo/seoConfig';

const materialItems = [
  'конспекти та теоретичні матеріали',
  'пам’ятки й основні формули',
  'самостійні та контрольні роботи',
  'презентації',
  'картки із завданнями',
  'інші матеріали для навчання та повторення'
];

export function AboutPage() {
  return (
    <Box component="section" className="about-archive-section about-page-section">
      <Seo {...aboutSeo} />
      <Container maxWidth="lg">
        <Grid container className="about-page-grid" spacing={{ xs: 2, md: 3 }} alignItems="stretch">
          <Grid className="about-page-grid-item" size={{ xs: 12, md: 7 }}>
            <Box className="about-feature about-feature-main teacher-profile-card">
              <Box className="feature-icon"><SchoolOutlinedIcon /></Box>
              <Box>
                <Typography component="h1" variant="h3">Про вчителя</Typography>
                <Typography className="teacher-name" variant="h4" component="p">
                  Морозова Тетяна Володимирівна
                </Typography>
              </Box>

              <Stack className="teacher-meta" direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                <Box className="teacher-meta-item">
                  <TimelineOutlinedIcon fontSize="small" />
                  <span>Понад <strong>30 років</strong> педагогічного стажу</span>
                </Box>
                <Box className="teacher-meta-item">
                  <PlaceOutlinedIcon fontSize="small" />
                  <span>Дніпровський полімовний ліцей №23 «Соборний» Дніпровської міської ради</span>
                </Box>
              </Stack>

              <Stack className="teacher-copy" gap={1.6} color="text.secondary">
                <Typography>
                  Учитель математики з понад <strong>30-річним педагогічним стажем</strong>.
                </Typography>
                <Typography>
                  Працюю у <strong>Дніпровському полімовному ліцеї №23 «Соборний» Дніпровської міської ради</strong>.
                </Typography>
                <Typography>
                  За роки роботи переконалася, що математика — це не лише формули, правила та обчислення. Вона вчить мислити, аналізувати, знаходити закономірності та шукати власний шлях до розв’язання задачі.
                </Typography>
                <Typography>
                  Матеріали, представлені на MathArchive, створені та відібрані на основі багаторічного досвіду роботи з учнями й орієнтовані на практичне використання під час уроків та самостійного навчання.
                </Typography>
              </Stack>
            </Box>
          </Grid>

          <Grid className="about-page-grid-item" size={{ xs: 12, md: 5 }}>
            <Stack gap={3} height="100%">
              <Box className="about-feature credo-card">
                <Box className="feature-icon sage"><FormatQuoteOutlinedIcon /></Box>
                <Typography component="h2" variant="h4">Моє педагогічне кредо</Typography>
                <Typography className="credo-quote" component="blockquote">
                  «Не просто навчити розв’язувати задачі, а навчити думати, шукати рішення та вірити у власні сили».
                </Typography>
                <Typography color="text.secondary">
                  Для мене важливо, щоб учень не просто запам’ятовував формули, а розумів логіку математики, не боявся помилок і поступово вчився знаходити рішення самостійно.
                </Typography>
              </Box>

              <Box className="about-feature compact archive-summary-card">
                <Box className="feature-icon blue"><AutoStoriesOutlinedIcon /></Box>
                <Typography component="h2" variant="h4">Про MathArchive</Typography>
                <Typography color="text.secondary">
                  MathArchive — це зібрання навчальних матеріалів з математики, створене для того, щоб потрібну інформацію можна було швидко знайти та зручно використовувати.
                </Typography>
                <Box component="ul" className="materials-list about-materials-list">
                  {materialItems.map((item) => <li key={item}>{item}</li>)}
                </Box>
                <Typography color="text.secondary">
                  Матеріали впорядковані за класами, темами й типами, щоб учням, батькам та вчителям було простіше знайти потрібне.
                </Typography>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}


