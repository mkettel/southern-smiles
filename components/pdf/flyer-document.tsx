/* eslint-disable jsx-a11y/alt-text -- react-pdf's <Image> is a PDF primitive, not an HTML <img>; it has no alt prop. */
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { FlyerConfig } from "@/lib/types";

export interface FlyerPageData {
  firstName: string;
  fullName: string;
  qrDataUrl: string;
  surveyUrl: string;
}

export interface FlyerDocumentProps {
  practiceName: string;
  logoDataUrl: string | null;
  backgroundDataUrl: string | null;
  config: FlyerConfig;
  creditLabel: string;
  questions: { label: string }[];
  pages: FlyerPageData[];
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#1a1a1a",
    position: "relative",
  },
  bgImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  // Readable panel that floats above the (solid-tint) background.
  panel: {
    margin: 40,
    padding: 28,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    flexGrow: 1,
  },
  // Image mode: the uploaded/AI image as a visible hero band at the top.
  heroImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 300,
    objectFit: "cover",
  },
  // White content card that sits below the hero image (solid, fully readable).
  contentCard: {
    marginTop: 250,
    marginHorizontal: 28,
    marginBottom: 28,
    padding: 26,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    flexGrow: 1,
  },
  logo: { height: 38, marginBottom: 16, objectFit: "contain" },
  heading: { fontSize: 26, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  greeting: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  body: { fontSize: 11, lineHeight: 1.5, marginBottom: 4, color: "#374151" },
  creditBox: {
    marginTop: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  creditAmount: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  creditCaption: { fontSize: 9, color: "#ffffff", opacity: 0.9 },
  signature: { fontSize: 11, color: "#374151", marginTop: 4 },
  signatureName: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  qrRow: { flexDirection: "row", marginTop: 20, alignItems: "center", gap: 16 },
  qrCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    alignItems: "center",
    width: 132,
  },
  qrImage: { width: 104, height: 104 },
  qrCaption: { fontSize: 8, color: "#6b7280", marginTop: 4, textAlign: "center" },
  qrSide: { flex: 1 },
  qrTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  qrHint: { fontSize: 10, color: "#6b7280", marginBottom: 6 },
  qrUrl: { fontSize: 9, color: "#374151" },
  questionsTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 6,
  },
  questionItem: { fontSize: 10, color: "#374151", marginBottom: 3 },
  footer: { marginTop: 18, fontSize: 8, color: "#9ca3af" },
});

function MultiLine({
  text,
  style,
}: {
  text: string;
  style?: (typeof styles)["signature"];
}) {
  const lines = (text ?? "").split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Text key={i} style={style}>
          {line || " "}
        </Text>
      ))}
    </>
  );
}

function FlyerPage({
  data,
  practiceName,
  logoDataUrl,
  backgroundDataUrl,
  config,
  creditLabel,
  questions,
}: { data: FlyerPageData } & Omit<FlyerDocumentProps, "pages">) {
  const accent = config.accentColor || "#0f766e";
  const showBg = config.backgroundMode === "image" && !!backgroundDataUrl;

  // Split body into paragraphs.
  const paragraphs = (config.body ?? "").split(/\n{2,}/).filter(Boolean);

  const content = (
    <>
      {logoDataUrl ? (
        <Image src={logoDataUrl} style={styles.logo} />
      ) : (
        <Text style={[styles.greeting, { color: accent }]}>{practiceName}</Text>
      )}

      {config.heading ? (
        <Text style={[styles.heading, { color: accent }]}>{config.heading}</Text>
      ) : null}

      <Text style={styles.greeting}>Dear {data.firstName},</Text>
      {paragraphs.map((p, i) => (
        <Text key={i} style={styles.body}>
          {p}
        </Text>
      ))}

      <View style={[styles.creditBox, { backgroundColor: accent }]}>
        <Text style={styles.creditCaption}>Our thank-you to you</Text>
        <Text style={styles.creditAmount}>{creditLabel} appreciation credit</Text>
      </View>

      {config.signature ? (
        <View style={styles.signature}>
          <MultiLine text={config.signature} style={styles.signature} />
        </View>
      ) : null}

      <View style={styles.qrRow}>
        <View style={[styles.qrCard, { borderColor: `${accent}55` }]}>
          <Image src={data.qrDataUrl} style={styles.qrImage} />
          <Text style={styles.qrCaption}>Scan with your camera</Text>
        </View>
        <View style={styles.qrSide}>
          <Text style={[styles.qrTitle, { color: accent }]}>Take the survey</Text>
          <Text style={styles.qrHint}>Scan the code, or visit:</Text>
          <Text style={styles.qrUrl}>{data.surveyUrl}</Text>
        </View>
      </View>

      {config.includeQuestions && questions.length > 0 ? (
        <View>
          <Text style={styles.questionsTitle}>We value your thoughts</Text>
          {questions.map((q, i) => (
            <Text key={i} style={styles.questionItem}>
              {i + 1}. {q.label}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.footer}>{practiceName}</Text>
    </>
  );

  // Image mode: image as a visible hero at the top, content on a white card
  // below. Solid mode: accent-tint background with a translucent panel.
  if (showBg) {
    return (
      <Page size="LETTER" style={styles.page}>
        <Image src={backgroundDataUrl!} style={styles.heroImage} />
        <View style={styles.contentCard}>{content}</View>
      </Page>
    );
  }

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={[styles.bgImage, { backgroundColor: `${accent}14` }]} />
      <View style={styles.panel}>{content}</View>
    </Page>
  );
}

export function FlyerDocument(props: FlyerDocumentProps) {
  const { pages, ...rest } = props;
  return (
    <Document>
      {pages.map((data, i) => (
        <FlyerPage key={i} data={data} {...rest} />
      ))}
    </Document>
  );
}
