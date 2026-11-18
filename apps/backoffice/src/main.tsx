import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.css";

import { createTheme, DirectionProvider, MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";

const theme = createTheme({
  primaryColor: "grape",
  fontFamily: "Rubik, system-ui, sans-serif",
  headings: { fontFamily: "Rubik, system-ui, sans-serif", fontWeight: "700" },
  defaultRadius: "md",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DirectionProvider initialDirection="rtl" detectDirection={false}>
      <MantineProvider theme={theme} defaultColorScheme="light">
        <DatesProvider settings={{ locale: "he", firstDayOfWeek: 0, weekendDays: [5, 6] }}>
          <ModalsProvider labels={{ confirm: "אישור", cancel: "ביטול" }}>
            <Notifications position="top-left" />
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ModalsProvider>
        </DatesProvider>
      </MantineProvider>
    </DirectionProvider>
  </StrictMode>,
);
