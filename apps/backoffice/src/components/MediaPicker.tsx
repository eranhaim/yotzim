import { ActionIcon, Box, Group, Image, Loader, SimpleGrid, Stack, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconArrowRight, IconPhotoPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { api, type Media } from "../api";

interface Props {
  value: Media[];
  onChange: (media: Media[]) => void;
  max?: number;
  accept?: "image" | "video" | "both";
  label?: string;
}

const ACCEPT = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/quicktime"],
};

export function MediaThumb({ media, h = 96 }: { media: Media; h?: number }) {
  return media.kind === "video" ? (
    <video src={media.url} muted playsInline style={{ width: "100%", height: h, objectFit: "cover", borderRadius: 8 }} />
  ) : (
    <Image src={media.url} h={h} radius="sm" fit="cover" alt="" />
  );
}

export function MediaPicker({ value, onChange, max = 10, accept = "both", label }: Props) {
  const [uploading, setUploading] = useState(false);
  const acceptTypes = accept === "both" ? [...ACCEPT.image, ...ACCEPT.video] : ACCEPT[accept];

  const onDrop = async (files: File[]) => {
    const room = max - value.length;
    if (room <= 0) {
      notifications.show({ color: "orange", message: `אפשר עד ${max} קבצים` });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await api.upload(files.slice(0, room));
      onChange(max === 1 ? uploaded.slice(0, 1) : [...value, ...uploaded]);
    } catch (err) {
      notifications.show({ color: "red", title: "ההעלאה נכשלה", message: (err as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <Stack gap={6}>
      {label && (
        <Text fz="sm" fw={500}>
          {label}
        </Text>
      )}
      {value.length > 0 && (
        <SimpleGrid cols={max === 1 ? 1 : { base: 3, sm: 4 }} spacing="xs">
          {value.map((m, i) => (
            <Box key={m.id} pos="relative">
              <MediaThumb media={m} h={max === 1 ? 180 : 96} />
              <Group gap={2} pos="absolute" top={4} left={4}>
                {max > 1 && value.length > 1 && (
                  <>
                    <ActionIcon size="sm" variant="white" onClick={() => move(i, -1)} disabled={i === 0} aria-label="הזזה ימינה">
                      <IconArrowRight size={14} />
                    </ActionIcon>
                    <ActionIcon size="sm" variant="white" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="הזזה שמאלה">
                      <IconArrowLeft size={14} />
                    </ActionIcon>
                  </>
                )}
                <ActionIcon size="sm" color="red" variant="white" onClick={() => onChange(value.filter((x) => x.id !== m.id))} aria-label="הסרה">
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Box>
          ))}
        </SimpleGrid>
      )}
      {value.length < max && (
        <Dropzone onDrop={onDrop} accept={acceptTypes} maxSize={300 * 1024 * 1024} multiple={max > 1} disabled={uploading} p="md">
          <Group justify="center" gap="sm" mih={60} style={{ pointerEvents: "none" }}>
            {uploading ? <Loader size="sm" /> : <IconPhotoPlus size={28} stroke={1.4} />}
            <div>
              <Text fz="sm" fw={500}>
                {uploading ? "מעלה…" : "גררו לכאן קבצים או לחצו לבחירה"}
              </Text>
              <Text fz="xs" c="dimmed">
                {accept === "video" ? "וידאו MP4 / MOV" : accept === "image" ? "תמונות JPG / PNG" : "תמונות או וידאו MP4"}
                {max > 1 ? ` · עד ${max} קבצים` : ""}
              </Text>
            </div>
          </Group>
        </Dropzone>
      )}
    </Stack>
  );
}
