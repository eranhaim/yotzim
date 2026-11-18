import { Alert, Group, Stack, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useMeta } from "../App";
import { api, type Party } from "../api";
import { PostCalendar } from "../components/PostCalendar";

export function CalendarPage() {
  const { meta } = useMeta();
  const [parties, setParties] = useState<Party[]>([]);

  useEffect(() => {
    api.get<Party[]>("/api/parties").then(setParties);
  }, []);

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>לוח פרסומים</Title>
          <Text c="dimmed" fz="sm">
            כל הפוסטים המתוזמנים לאינסטגרם, של כל המסיבות. פוסט עולה אוטומטית בזמן שנקבע.
          </Text>
        </div>
      </Group>
      {!meta.instagramLive && (
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
          אינסטגרם עדיין לא מחובר, ולכן פרסום הוא מדומה: הפוסט יסומן כ״פורסם״ בלי לעלות באמת. אחרי חיבור החשבון בהגדרות, אותו לוח יעלה פוסטים אמיתיים.
        </Alert>
      )}
      <PostCalendar parties={parties} />
    </Stack>
  );
}
