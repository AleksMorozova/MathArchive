import { Container, Stack, Typography } from '@mui/material';
import { AssistantChat } from '../components/assistant/AssistantChat';
import { Seo } from '../seo/Seo';

export function AssistantPage() {
  return <Container maxWidth="md" sx={{ py: 3 }}>
    <Seo title="AI-помічник | MathArchive" description="Пояснення, вправи та пошук навчальних матеріалів з математики." canonicalPath="/assistant" noIndex />
    <Stack gap={2}><Typography variant="h4">Математичний AI-помічник</Typography>
      <Stack sx={{ height: 'min(760px, 85dvh)', minHeight: 440, border: '1px solid #D6E1EC', borderRadius: 3, overflow: 'hidden' }}><AssistantChat /></Stack>
    </Stack>
  </Container>;
}
