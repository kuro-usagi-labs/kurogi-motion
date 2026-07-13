import type { CreateProjectOptions, ProjectFormat } from "./project";
import { addLayers, createAnimationAction, createProject, getActiveScene } from "./project";
import { auditTemplateProject, logTemplateAudit, type TemplateAuditReport } from "./templateAudit";
import { createTemplateFrame, normalizeTemplateLayers, type TemplateFrame, type TemplateRect } from "./templateLayout";
import type { AnimationType, KurogiProject, Layer, LayerEffectType, Scene, ShapeLayer, TextLayer } from "../types";

export type TemplateCategory = "Social" | "Marketing" | "Brand" | "UI" | "Typography";

export interface MotionTemplateDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  format: Exclude<ProjectFormat, "custom">;
  duration: number;
  description: string;
  palette: [string, string, string];
  preview: "chat" | "comment" | "notification" | "product" | "quote" | "logo" | "announcement" | "lower-third" | "phone" | "countdown" | "testimonial" | "stat" | "orbit" | "stack" | "kinetic" | "liquid" | "gallery" | "sale" | "button" | "chart";
}

export const MOTION_TEMPLATES: MotionTemplateDefinition[] = [
  { id: "chatbox", name: "Chatbox conversation", category: "Social", format: "vertical", duration: 6, description: "Layered message bubbles with balanced spacing and staggered replies.", palette: ["#dfe7ff", "#7c5cff", "#17192b"], preview: "chat" },
  { id: "comment", name: "Comment spotlight", category: "Social", format: "square", duration: 5, description: "A premium viewer comment card with clean social micro-motion.", palette: ["#fff4df", "#ff8a5b", "#24212c"], preview: "comment" },
  { id: "notification", name: "App notification", category: "UI", format: "vertical", duration: 4.5, description: "A glass notification stack with strong product hierarchy.", palette: ["#11131c", "#67e8c3", "#f4f5fa"], preview: "notification" },
  { id: "product", name: "Product reveal", category: "Marketing", format: "square", duration: 6, description: "A bold launch scene with orbiting labels and dimensional depth.", palette: ["#f8f4ff", "#9f7aea", "#261b43"], preview: "product" },
  { id: "quote", name: "Editorial quote", category: "Typography", format: "portrait", duration: 5.5, description: "Editorial kinetic typography with measured whitespace.", palette: ["#fff1e8", "#f08c72", "#4b2730"], preview: "quote" },
  { id: "logo", name: "Liquid logo reveal", category: "Brand", format: "landscape", duration: 5.5, description: "An elastic logo reveal with luminous liquid distortion.", palette: ["#11121a", "#a78bfa", "#f4f1ff"], preview: "logo" },
  { id: "announcement", name: "Collection announcement", category: "Social", format: "vertical", duration: 5.5, description: "Mask-driven announcement type with playful accents.", palette: ["#dffbf2", "#62d4ad", "#163c31"], preview: "announcement" },
  { id: "lower-third", name: "Creator lower third", category: "Brand", format: "landscape", duration: 6, description: "A broadcast-ready identity strip with clean exits.", palette: ["#11131d", "#8b5cf6", "#ffffff"], preview: "lower-third" },
  { id: "app-promo", name: "App feature showcase", category: "UI", format: "vertical", duration: 6.5, description: "A phone-style product scene with floating feature cards.", palette: ["#eef2ff", "#5b67f1", "#11152b"], preview: "phone" },
  { id: "countdown", name: "Launch countdown", category: "Marketing", format: "square", duration: 5, description: "High-impact countdown type with glow and heartbeat motion.", palette: ["#12131b", "#ffcc66", "#f7f4ff"], preview: "countdown" },
  { id: "testimonial", name: "Customer testimonial", category: "Marketing", format: "portrait", duration: 6, description: "A balanced review card with readable copy and tighter rhythm.", palette: ["#f4efff", "#7c5cff", "#2d2442"], preview: "testimonial" },
  { id: "stat-card", name: "Animated stat card", category: "Marketing", format: "square", duration: 5.5, description: "A metric reveal with orbiting indicators and subtle grain.", palette: ["#e8fff7", "#28b894", "#15342d"], preview: "stat" },
  { id: "gradient-orbit", name: "Gradient orbit", category: "Brand", format: "square", duration: 6, description: "A looping brand backdrop with layered orbital motion.", palette: ["#12131f", "#845ef7", "#67e8c3"], preview: "orbit" },
  { id: "card-stack", name: "Orbiting card stack", category: "UI", format: "landscape", duration: 7, description: "A dynamic product card stack for websites and showreels.", palette: ["#14151e", "#ff8a5b", "#f7f4ff"], preview: "stack" },
  { id: "kinetic-type", name: "Kinetic type wall", category: "Typography", format: "landscape", duration: 5, description: "Oversized type that stretches, flips, and snaps into rhythm.", palette: ["#f5f0ff", "#241b45", "#9f7aea"], preview: "kinetic" },
  { id: "liquid-title", name: "Liquid title", category: "Typography", format: "square", duration: 6, description: "Organic type and blobs with water-drop distortion.", palette: ["#e8fbff", "#19a7ce", "#113946"], preview: "liquid" },
  { id: "gallery-swipe", name: "Gallery swipe", category: "Social", format: "vertical", duration: 7, description: "A layered photo-story structure with wipe transitions.", palette: ["#f5f1ea", "#f08c72", "#2a2630"], preview: "gallery" },
  { id: "sale-poster", name: "Flash sale poster", category: "Marketing", format: "portrait", duration: 5, description: "High-energy retail typography with badges and glow.", palette: ["#1b1630", "#ff4d8d", "#fff4a3"], preview: "sale" },
  { id: "button-micro", name: "Button microinteraction", category: "UI", format: "landscape", duration: 4.5, description: "A polished call-to-action button with feedback states.", palette: ["#f3f4f8", "#7254d6", "#171821"], preview: "button" },
  { id: "chart-reveal", name: "Growth chart reveal", category: "UI", format: "landscape", duration: 6, description: "A clean dashboard chart with sequential data motion.", palette: ["#111722", "#67e8c3", "#f4f7fb"], preview: "chart" },
];

export function createCatalogTemplateProject(options: CreateProjectOptions, templateId?: string): KurogiProject {
  let project = createProject(options);
  if (!templateId) return project;
  const definition = MOTION_TEMPLATES.find((item) => item.id === templateId);
  const scene = getActiveScene(project);
  if (definition) project.scenes[scene.id].background = { type: "solid", color: definition.palette[0] };
  const normalized = normalizeTemplateLayers(scene, buildTemplateLayers(scene, templateId));
  project = addLayers(project, normalized);
  const report = auditTemplateProject(project, templateId);
  if (import.meta.env.DEV) logTemplateAudit(report);
  return project;
}

export function auditAllCatalogTemplates(): TemplateAuditReport[] {
  return MOTION_TEMPLATES.map((definition) => {
    const project = createCatalogTemplateProject({ name: definition.name, format: definition.format, duration: definition.duration, fps: 30, background: definition.palette[0] }, definition.id);
    return auditTemplateProject(project, definition.id);
  });
}

function buildTemplateLayers(scene: Scene, id: string): Layer[] {
  const builders: Record<string, (scene: Scene) => Layer[]> = {
    chatbox: buildChatbox,
    comment: buildComment,
    notification: buildNotification,
    product: buildProduct,
    quote: buildQuote,
    logo: buildLogo,
    announcement: buildAnnouncement,
    "lower-third": buildLowerThird,
    "app-promo": buildAppPromo,
    countdown: buildCountdown,
    testimonial: buildTestimonial,
    "stat-card": buildStatCard,
    "gradient-orbit": buildGradientOrbit,
    "card-stack": buildCardStack,
    "kinetic-type": buildKineticType,
    "liquid-title": buildLiquidTitle,
    "gallery-swipe": buildGallerySwipe,
    "sale-poster": buildSalePoster,
    "button-micro": buildButtonMicro,
    "chart-reveal": buildChartReveal,
  };
  return builders[id]?.(scene) ?? [];
}

function buildChatbox(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const eyebrow = f.text("Conversation label", "TEAM CHAT · LIVE", f.rect(0.02, 0.01, 0.56, 0.045), "label", "#5d6280");
  const title = f.text("Conversation title", "IDEAS MOVE\nFASTER TOGETHER.", f.rect(0.02, 0.07, 0.86, 0.17), "headline", "#17192b");
  const bubbleA = f.card("Message from Alex", f.rect(0.02, 0.31, 0.76, 0.16), "#ffffff", { radius: 42 * f.unit, shadow: 22 });
  const avatarA = f.circle("Alex avatar", sq(f, 0.065, 0.345, 0.09), "linear-gradient(145deg,#ff9c70,#ff6b5e)");
  const messageA = f.text("Message from Alex copy", "Alex · 09:42\nThe launch draft is ready ✨", f.rect(0.19, 0.335, 0.53, 0.105), "body", "#202235", { fontSize: 30 * f.unit });
  const bubbleB = f.card("Reply bubble", f.rect(0.2, 0.52, 0.78, 0.15), "linear-gradient(135deg,#8c68ff,#6e4fe2)", { radius: 42 * f.unit, shadow: 24 });
  const messageB = f.text("Reply copy", "Perfect. Let’s make it move.", f.rect(0.27, 0.565, 0.62, 0.06), "body", "#ffffff", { fontSize: 32 * f.unit, weight: 700 });
  const typing = f.card("Typing indicator", f.rect(0.03, 0.75, 0.25, 0.065), "rgba(255,255,255,.78)", { radius: 999 });
  const dots = f.text("Typing dots", "●  ●  ●", f.rect(0.075, 0.765, 0.16, 0.03), "meta", "#7c5cff", { align: "center" });
  enter(eyebrow, "fadeIn", 0, .4); enter(title, "moveIn", .08, .7, { direction: "up", distance: 80 }, true, "line");
  enter(bubbleA, "springIn", .42, .75); enter(avatarA, "popIn", .62, .45); enter(messageA, "fadeIn", .72, .42);
  enter(bubbleB, "slideIn", 1.05, .65, { direction: "right", distance: 180 }); enter(messageB, "fadeIn", 1.28, .4);
  enter(typing, "popIn", 1.72, .42); enter(dots, "fadeIn", 1.85, .3); loop(dots, "heartbeat", 2.1, 1.25, { intensity: .12 }); loop(bubbleB, "hover", 1.8, 2.8, { intensity: 8 });
  return [eyebrow, title, bubbleA, avatarA, messageA, bubbleB, messageB, typing, dots];
}

function buildComment(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const halo = f.decorativeCircle("Soft halo", sq(f, .64, -.04, .4), "radial-gradient(circle,#ffc4a7,rgba(255,196,167,0))", { opacity: .62 }); fx(halo, "blur", 22, 26);
  const card = f.card("Comment card", f.rect(.06, .16, .88, .66), "rgba(255,255,255,.94)", { radius: 54 * f.unit, shadow: 36 }); fx(card, "glass", 28, 16);
  const avatar = f.circle("Avatar", sq(f, .12, .25, .12), "linear-gradient(145deg,#ff9c70,#ff6b5e)");
  const user = f.text("Username", "@creativefriend", f.rect(.28, .255, .43, .055), "title", "#24212c", { fontSize: 29 * f.unit });
  const badge = f.card("Creator badge", f.rect(.73, .26, .14, .045), "#f1ecff", { radius: 999 });
  const badgeText = f.text("Badge text", "CREATOR", f.rect(.75, .27, .1, .025), "meta", "#6b4dc3", { align: "center", fontSize: 14 * f.unit });
  const comment = f.text("Comment", "“This animation made the whole post feel premium.”", f.rect(.12, .405, .76, .19), "title", "#24212c", { fontSize: 45 * f.unit, lineHeight: 1.08 });
  const likes = f.text("Likes", "♥  1,284", f.rect(.12, .69, .25, .04), "label", "#ff5d78");
  const reply = f.text("Reply", "Reply  ·  Share", f.rect(.58, .69, .3, .04), "meta", "#77717f", { align: "right" });
  enter(halo, "scaleIn", 0, .8); loop(halo, "breathe", .8, 2.2, { intensity: .1 }); enter(card, "springIn", .08, .8);
  enter(avatar, "popIn", .32, .45); enter(user, "slideIn", .4, .52, { direction: "left", distance: 90 }); enter(badge, "stretchIn", .55, .48, { axis: "x" }); enter(badgeText, "fadeIn", .68, .3);
  enter(comment, "moveIn", .66, .68, { direction: "up", distance: 70 }, true, "word"); enter(likes, "popIn", 1.18, .42); enter(reply, "fadeIn", 1.28, .36); loop(avatar, "glowPulse", 1.25, 2.1, { intensity: 16 });
  return [halo, card, avatar, user, badge, badgeText, comment, likes, reply];
}

function buildNotification(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const glow = f.decorativeCircle("Ambient glow", sq(f, .08, .08, .74), "radial-gradient(circle,#5f6cd9,rgba(95,108,217,0))", { opacity: .46 }); fx(glow, "blur", 36, 40);
  const label = f.text("Section title", "PRODUCT UPDATE", f.rect(.03, .03, .55, .04), "label", "#67e8c3");
  const headline = f.text("Headline", "THE WORKFLOW\nJUST GOT LIGHTER.", f.rect(.03, .1, .88, .17), "headline", "#f4f5fa", { fontSize: 66 * f.unit });
  const back = f.card("Back notification", f.rect(.09, .37, .82, .18), "rgba(45,49,66,.58)", { radius: 48 * f.unit, rotation: -3, opacity: .58 }); fx(back, "glass", 42, 18);
  const card = f.card("Notification", f.rect(.04, .42, .92, .23), "rgba(36,39,52,.9)", { radius: 48 * f.unit, shadow: 40 }); fx(card, "glass", 58, 22);
  const icon = f.circle("App icon", sq(f, .1, .465, .14), "linear-gradient(145deg,#7cf3d5,#4fc8ad)"); fx(icon, "glow", 24, 22, "#67e8c3");
  const symbol = f.text("App symbol", "K", f.rect(.132, .49, .075, .055), "title", "#15231f", { align: "center", fontSize: 42 * f.unit });
  const copy = f.text("Notification copy", "Kurogi Motion\nYour ProRes export is ready.", f.rect(.29, .465, .51, .115), "body", "#f4f5fa", { fontSize: 36 * f.unit });
  const time = f.text("Notification time", "now", f.rect(.81, .455, .1, .035), "meta", "#9ca2b4", { align: "right" });
  const footer = f.text("Footer", "Tap to reveal your animation", f.rect(.16, .72, .68, .04), "meta", "#81889a", { align: "center", fontSize: 22 * f.unit });
  enter(glow, "zoomBlurIn", 0, .9); enter(label, "fadeIn", .08, .42); enter(headline, "moveIn", .16, .75, { direction: "up", distance: 80 }, true, "line");
  enter(back, "flipIn", .52, .7); enter(card, "springIn", .7, .8); enter(icon, "popIn", .95, .48); enter(symbol, "fadeIn", 1.06, .3); enter(copy, "fadeIn", 1.12, .48); enter(time, "fadeIn", 1.28, .3); enter(footer, "moveIn", 1.45, .5, { direction: "up", distance: 40 });
  loop(card, "hover", 1.8, 3, { intensity: 7 }); loop(icon, "glowPulse", 1.6, 2, { intensity: 20 });
  return [glow, label, headline, back, card, icon, symbol, copy, time, footer];
}

function buildTestimonial(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const blob = f.decorativeCircle("Backdrop blob", sq(f, .58, -.04, .48), "linear-gradient(145deg,#c8b2ff,#8d68ed)", { opacity: .48 }); fx(blob, "blur", 22, 26); fx(blob, "waterDrop", 12, 10);
  const card = f.card("Testimonial card", f.rect(.02, .05, .96, .86), "rgba(255,255,255,.95)", { radius: 56 * f.unit, shadow: 38 }); fx(card, "glass", 18, 10);
  const quoteMark = f.text("Quote mark", "“", f.rect(.08, .075, .13, .09), "display", "#7c5cff", { fontSize: 110 * f.unit, lineHeight: .8 });
  const avatar = f.circle("Customer avatar", sq(f, .09, .205, .105), "linear-gradient(145deg,#9270ef,#6541bd)");
  const initials = f.text("Customer initials", "NP", f.rect(.112, .237, .06, .035), "meta", "#ffffff", { align: "center", weight: 800, fontSize: 22 * f.unit });
  const name = f.text("Customer name", "Nadia Pratama", f.rect(.24, .212, .53, .045), "title", "#2d2442", { fontSize: 30 * f.unit });
  const role = f.text("Customer role", "Social Media Designer", f.rect(.24, .265, .53, .035), "meta", "#827895", { fontSize: 19 * f.unit });
  const quote = f.text("Review quote", "I made three polished ad variations before lunch — without touching a keyframe.", f.rect(.09, .39, .82, .22), "title", "#2d2442", { fontSize: 48 * f.unit, lineHeight: 1.08, weight: 750 });
  const divider = f.card("Quote divider", f.rect(.09, .655, .82, .006), "#e7def6", { radius: 999 });
  const stars = f.text("Rating", "★★★★★", f.rect(.09, .7, .28, .035), "label", "#ffb84d", { letterSpacing: 2 * f.unit });
  const meta = f.text("Review meta", "VERIFIED CUSTOMER · 4.9/5", f.rect(.43, .705, .48, .03), "meta", "#8b8298", { align: "right", fontSize: 16 * f.unit });
  enter(blob, "zoomBlurIn", 0, .9); loop(blob, "liquid", .9, 2.8, { intensity: .07 }); enter(card, "springIn", .1, .85); enter(quoteMark, "popIn", .35, .48);
  enter(avatar, "popIn", .48, .46); enter(initials, "fadeIn", .62, .3); enter(name, "slideIn", .58, .5, { direction: "left", distance: 70 }); enter(role, "fadeIn", .76, .35);
  enter(quote, "moveIn", .82, .7, { direction: "up", distance: 58 }, true, "word"); enter(divider, "wipeIn", 1.25, .4, { direction: "left" }); enter(stars, "stretchIn", 1.38, .45, { axis: "x" }); enter(meta, "fadeIn", 1.5, .35); loop(stars, "glowPulse", 1.9, 2.2, { intensity: 10 });
  return [blob, card, quoteMark, avatar, initials, name, role, quote, divider, stars, meta];
}

function buildQuote(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const line = f.card("Accent line", f.rect(.02, .04, .18, .009), "#f08c72", { radius: 999 });
  const mark = f.text("Quote mark", "“", f.rect(.02, .095, .16, .1), "display", "#f08c72", { fontSize: 120 * f.unit });
  const quote = f.text("Quote", "MAKE\nEVERY IDEA\nMOVE.", f.rect(.04, .22, .78, .45), "display", "#4b2730", { fontSize: 102 * f.unit });
  const byline = f.text("Byline", "— KUROGI CREATIVE SYSTEM", f.rect(.04, .76, .62, .04), "label", "#8a5b65");
  const accentA = f.decorativeCircle("Accent A", sq(f, .72, .66, .2), "linear-gradient(145deg,#f5a58e,#ef735f)"); fx(accentA, "waterDrop", 18, 12);
  const accentB = f.decorativeCircle("Accent B", sq(f, .83, .59, .09), "#ffd2c4");
  enter(line, "stretchIn", 0, .55, { axis: "x" }); enter(mark, "popIn", .15, .55); enter(quote, "moveIn", .28, .8, { direction: "up", distance: 95 }, true, "word"); enter(byline, "fadeIn", 1.05, .45);
  enter(accentA, "springIn", .48, .75); enter(accentB, "popIn", .72, .5); loop(accentA, "liquid", 1.2, 2.5, { intensity: .09 }); loop(accentB, "orbit", 1.2, 3.2, { intensity: 12 });
  return [line, mark, quote, byline, accentA, accentB];
}

function buildProduct(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const orbA = f.decorativeCircle("Purple orb", sq(f, .55, .01, .43), "linear-gradient(145deg,#b89aff,#7d55e7)"); fx(orbA, "blur", 8, 10); fx(orbA, "glow", 22, 30, "#9f7aea");
  const orbB = f.decorativeCircle("Mint orb", sq(f, -.06, .66, .31), "linear-gradient(145deg,#9af4d7,#62d4ad)"); fx(orbB, "blur", 5, 8);
  const product = f.card("Product card", f.rect(.53, .17, .37, .59), "linear-gradient(155deg,#9f7aea,#6d46c7)", { radius: 58 * f.unit, shadow: 44 }); fx(product, "glass", 22, 14);
  const inner = f.card("Product face", f.rect(.58, .25, .27, .35), "linear-gradient(160deg,#ffffff,#e9e1ff)", { radius: 38 * f.unit });
  const mark = f.text("Product mark", "K", f.rect(.64, .36, .15, .12), "display", "#5d3dae", { align: "center", fontSize: 105 * f.unit });
  const title = f.text("Launch headline", "NEW\nDROP.", f.rect(.02, .16, .5, .29), "display", "#261b43", { fontSize: 118 * f.unit });
  const subtitle = f.text("Subtitle", "DESIGNED TO MOVE", f.rect(.03, .61, .4, .04), "label", "#6e6688");
  const badge = f.card("Launch badge", f.rect(.03, .71, .29, .07), "#261b43", { radius: 999 });
  const badgeText = f.text("Badge text", "LIMITED EDITION", f.rect(.07, .73, .21, .03), "meta", "#ffffff", { align: "center", fontSize: 16 * f.unit });
  enter(orbA, "zoomBlurIn", 0, .9); enter(orbB, "scaleIn", .15, .7); loop(orbA, "orbit", .8, 4, { intensity: 18 }); loop(orbB, "drift", .8, 3.4, { intensity: 14 });
  enter(product, "springIn", .2, .9); enter(inner, "flipIn", .52, .75); enter(mark, "popIn", .78, .48); loop(product, "hover", 1.15, 2.8, { intensity: 13 });
  enter(title, "stretchIn", .05, .72, { axis: "y" }, true, "line"); enter(subtitle, "slideIn", .55, .55, { direction: "left", distance: 100 }); enter(badge, "popIn", .82, .45); enter(badgeText, "fadeIn", .96, .3);
  return [orbA, orbB, product, inner, mark, title, subtitle, badge, badgeText];
}

function buildLogo(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const glow = f.decorativeCircle("Logo glow", sq(f, .36, .02, .28), "radial-gradient(circle,#8d68f0,rgba(141,104,240,0))", { opacity: .62 }); fx(glow, "blur", 30, 36);
  const ring = f.circle("Outer ring", sq(f, .435, .2, .13), "rgba(255,255,255,.04)", { stroke: "#a78bfa", strokeWidth: 5 * f.unit });
  const mark = f.card("Logo block", f.rect(.455, .31, .09, .2), "linear-gradient(145deg,#b39aff,#7249dd)", { radius: 42 * f.unit }); fx(mark, "waterDrop", 16, 10); fx(mark, "glow", 30, 32, "#9f7aea");
  const letter = f.text("Logo letter", "K", f.rect(.467, .36, .066, .08), "headline", "#ffffff", { align: "center", fontSize: 72 * f.unit });
  const name = f.text("Brand name", "KUROGI MOTION", f.rect(.25, .65, .5, .08), "title", "#f4f1ff", { align: "center" });
  const tagline = f.text("Tagline", "CREATE MOTION, NOT KEYFRAMES", f.rect(.3, .76, .4, .035), "meta", "#9993aa", { align: "center" });
  enter(glow, "zoomBlurIn", 0, 1); loop(glow, "breathe", .9, 2.4, { intensity: .12 }); enter(ring, "scaleIn", .08, .8); loop(ring, "spin", .8, 5, { turns: 1 });
  enter(mark, "elasticIn", .2, 1); enter(letter, "fadeIn", .62, .4); loop(mark, "liquid", 1.15, 2.6, { intensity: .065 }); enter(name, "fadeIn", .75, .6, {}, true, "character"); enter(tagline, "moveIn", 1.15, .5, { direction: "up", distance: 36 });
  return [glow, ring, mark, letter, name, tagline];
}

function buildAnnouncement(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const top = f.text("Top label", "SEASON 02 · 2026", f.rect(.02, .02, .55, .035), "meta", "#4b826f");
  const title = f.text("Announcement", "THE NEW\nCOLLECTION\nIS HERE.", f.rect(.02, .13, .8, .4), "display", "#163c31", { fontSize: 98 * f.unit });
  const pill = f.card("Announcement pill", f.rect(.03, .65, .5, .08), "linear-gradient(90deg,#62d4ad,#8ae6c6)", { radius: 999 });
  const label = f.text("Pill label", "EXPLORE THE DROP", f.rect(.08, .67, .4, .035), "label", "#163c31", { align: "center" });
  const arrow = f.text("Arrow", "↗", f.rect(.65, .61, .16, .12), "display", "#163c31", { align: "center", fontSize: 86 * f.unit });
  const blob = f.decorativeCircle("Liquid blob", sq(f, .66, .11, .27), "linear-gradient(145deg,#8ae6c6,#42b993)"); fx(blob, "waterDrop", 24, 18); fx(blob, "glow", 12, 16, "#62d4ad");
  enter(top, "fadeIn", 0, .4); enter(title, "wipeIn", .1, .85, { direction: "left" }, true, "line"); enter(blob, "springIn", .38, .8); loop(blob, "liquid", 1, 2.4, { intensity: .09 });
  enter(pill, "slideIn", .68, .6, { direction: "left", distance: 120 }); enter(label, "fadeIn", .9, .35); enter(arrow, "rollIn", .78, .7, { direction: "right", distance: 80, rotation: 150 }); loop(arrow, "jiggle", 1.5, 1.2, { intensity: 4 });
  return [top, title, pill, label, arrow, blob];
}

function buildLowerThird(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const glow = f.decorativeCard("Accent glow", f.rect(.01, .62, .62, .27), "rgba(139,92,246,.18)", { radius: 38 * f.unit }); fx(glow, "blur", 20, 30);
  const bar = f.card("Lower third bar", f.rect(.03, .67, .56, .19), "linear-gradient(110deg,#8b5cf6,#5e3bb8)", { radius: 28 * f.unit, shadow: 26 }); fx(bar, "glass", 18, 10);
  const avatar = f.circle("Avatar", sq(f, .055, .705, .09), "#ffffff");
  const initials = f.text("Initials", "GC", f.rect(.072, .745, .055, .035), "meta", "#5e3bb8", { align: "center", weight: 800 });
  const name = f.text("Creator name", "GILANG CREATIVE", f.rect(.18, .705, .35, .055), "title", "#ffffff", { fontSize: 40 * f.unit });
  const role = f.text("Creator role", "MOTION DESIGNER", f.rect(.18, .775, .31, .035), "meta", "#d8ccff");
  const line = f.card("Accent line", f.rect(.18, .83, .13, .008), "#ffffff", { radius: 999 });
  enter(glow, "fadeIn", .1, .5); enter(bar, "slideIn", .18, .7, { direction: "left", distance: 210 }); enter(avatar, "popIn", .55, .45); enter(initials, "fadeIn", .7, .3); enter(name, "moveIn", .58, .5, { direction: "left", distance: 70 }); enter(role, "fadeIn", .8, .35); enter(line, "stretchIn", .9, .4, { axis: "x" });
  out(glow, scene, "fadeOut", .45); out(bar, scene, "slideOut", .6, { direction: "left", distance: 210 }); out(avatar, scene, "popOut", .42); out(initials, scene, "fadeOut", .3); out(name, scene, "fadeOut", .4); out(role, scene, "fadeOut", .35); out(line, scene, "stretchOut", .35, { axis: "x" });
  return [glow, bar, avatar, initials, name, role, line];
}

function buildAppPromo(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const title = f.text("Feature headline", "YOUR WORKFLOW\nJUST GOT FASTER.", f.rect(.02, .02, .88, .18), "headline", "#11152b", { fontSize: 66 * f.unit });
  const subtitle = f.text("Feature subtitle", "Design, animate, and export without leaving the flow.", f.rect(.03, .23, .76, .065), "body", "#5c6485", { fontSize: 24 * f.unit });
  const phoneGlow = f.decorativeCard("Phone glow", f.rect(.17, .36, .66, .54), "rgba(91,103,241,.22)", { radius: 70 * f.unit }); fx(phoneGlow, "blur", 25, 32);
  const phone = f.card("Phone frame", f.rect(.22, .34, .56, .52), "#11152b", { radius: 64 * f.unit, shadow: 44 });
  const screen = f.card("Phone screen", f.rect(.26, .39, .48, .42), "linear-gradient(155deg,#6976ff,#4d57d7)", { radius: 46 * f.unit });
  const cardA = f.card("Feature card A", f.rect(.3, .47, .4, .1), "rgba(255,255,255,.94)", { radius: 28 * f.unit });
  const cardAText = f.text("Feature A", "LIVE PREVIEW", f.rect(.35, .5, .3, .035), "label", "#11152b", { align: "center" });
  const cardB = f.card("Feature card B", f.rect(.33, .62, .34, .1), "rgba(255,255,255,.18)", { radius: 28 * f.unit }); fx(cardB, "glass", 35, 12);
  const cardBText = f.text("Feature B", "ONE-TAP MOTION", f.rect(.37, .65, .26, .035), "meta", "#ffffff", { align: "center" });
  enter(title, "moveIn", 0, .7, { direction: "up", distance: 80 }, true, "line"); enter(subtitle, "fadeIn", .5, .45); enter(phoneGlow, "zoomBlurIn", .25, .8); enter(phone, "springIn", .38, .85); enter(screen, "fadeIn", .7, .45); enter(cardA, "slideIn", .88, .55, { direction: "left", distance: 90 }); enter(cardAText, "fadeIn", 1.05, .3); enter(cardB, "slideIn", 1.15, .55, { direction: "right", distance: 90 }); enter(cardBText, "fadeIn", 1.32, .3);
  loop(phone, "hover", 1.7, 3.1, { intensity: 9 }); loop(cardA, "pulse", 1.7, 1.8, { intensity: .025 }); loop(cardB, "glowPulse", 1.8, 2.2, { intensity: 10 });
  return [title, subtitle, phoneGlow, phone, screen, cardA, cardAText, cardB, cardBText];
}

function buildCountdown(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const ring = f.circle("Countdown ring", sq(f, .2, .13, .6), "rgba(255,204,102,.04)", { stroke: "#ffcc66", strokeWidth: 5 * f.unit }); fx(ring, "glow", 25, 26, "#ffcc66");
  const label = f.text("Countdown label", "LAUNCHING IN", f.rect(.22, .18, .56, .05), "label", "#ffcc66", { align: "center" });
  const number = f.text("Countdown number", "03", f.rect(.18, .3, .64, .34), "display", "#f7f4ff", { align: "center", fontSize: 245 * f.unit }); fx(number, "glow", 18, 20, "#8b5cf6");
  const footer = f.text("Countdown footer", "SAVE THE DATE · 13 JULY", f.rect(.2, .76, .6, .045), "label", "#a6a2b3", { align: "center" });
  const dotA = f.circle("Orbit dot A", sq(f, .48, .09, .04), "#ffcc66"); const dotB = f.circle("Orbit dot B", sq(f, .48, .82, .04), "#8b5cf6");
  enter(ring, "scaleIn", 0, .8); loop(ring, "spin", .8, 6, { turns: 1 }); enter(label, "fadeIn", .12, .4); enter(number, "popIn", .22, .75); loop(number, "heartbeat", 1.1, 1.25, { intensity: .08 }); enter(footer, "moveIn", .72, .5, { direction: "up", distance: 45 }); enter(dotA, "popIn", .45, .4); enter(dotB, "popIn", .6, .4); loop(dotA, "orbit", 1, 2.8, { intensity: 16 }); loop(dotB, "orbit", 1, 3.2, { intensity: 14 });
  return [ring, label, number, footer, dotA, dotB];
}

function buildStatCard(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const back = f.decorativeCard("Backdrop card", f.rect(.1, .11, .8, .7), "rgba(40,184,148,.18)", { radius: 58 * f.unit, rotation: -4 }); fx(back, "blur", 4, 5);
  const card = f.card("Metric card", f.rect(.06, .16, .88, .66), "rgba(255,255,255,.95)", { radius: 58 * f.unit, shadow: 34 });
  const eyebrow = f.text("Metric label", "CAMPAIGN LIFT", f.rect(.13, .27, .48, .045), "label", "#28b894");
  const metric = f.text("Metric", "+42%", f.rect(.11, .38, .68, .2), "display", "#15342d", { fontSize: 145 * f.unit }); fx(metric, "grain", 8, 0);
  const detail = f.text("Metric detail", "More completed views after adding motion.", f.rect(.13, .66, .66, .075), "body", "#607b73", { fontSize: 26 * f.unit });
  const chip = f.card("Trend chip", f.rect(.65, .27, .2, .06), "#d9fff3", { radius: 999 });
  const chipText = f.text("Trend text", "↗  12.8%", f.rect(.69, .29, .12, .025), "meta", "#19866c", { align: "center" });
  const dotA = f.circle("Data dot A", sq(f, .73, .69, .055), "#28b894"); const dotB = f.circle("Data dot B", sq(f, .81, .63, .035), "#9ce7d1");
  enter(back, "rotateIn", 0, .72); enter(card, "springIn", .12, .8); enter(eyebrow, "fadeIn", .38, .35); enter(metric, "moveIn", .48, .72, { direction: "up", distance: 80 }, true, "character"); enter(detail, "fadeIn", 1.05, .42); enter(chip, "popIn", .82, .44); enter(chipText, "fadeIn", .95, .3); enter(dotA, "popIn", 1.15, .42); enter(dotB, "popIn", 1.3, .4); loop(metric, "breathe", 1.6, 2, { intensity: .025 }); loop(dotA, "orbit", 1.6, 2.6, { intensity: 10 });
  return [back, card, eyebrow, metric, detail, chip, chipText, dotA, dotB];
}

function buildGradientOrbit(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const orbA = f.decorativeCircle("Violet orbit", sq(f, .18, .12, .36), "linear-gradient(145deg,#9d79ff,#5e3bd1)"); fx(orbA, "glow", 30, 40, "#845ef7"); fx(orbA, "waterDrop", 18, 12);
  const orbB = f.decorativeCircle("Mint orbit", sq(f, .53, .39, .28), "linear-gradient(145deg,#89f1d2,#36b999)"); fx(orbB, "glow", 22, 34, "#67e8c3");
  const orbC = f.decorativeCircle("Pink orbit", sq(f, .43, .15, .15), "linear-gradient(145deg,#ff8fbc,#e34887)");
  const title = f.text("Orbit title", "BRAND\nIN MOTION", f.rect(.1, .68, .8, .16), "headline", "#f7f4ff", { align: "center" });
  const label = f.text("Orbit label", "SEAMLESS LOOP · 06 SEC", f.rect(.25, .89, .5, .03), "meta", "#8f8ba0", { align: "center" });
  enter(orbA, "zoomBlurIn", 0, .9); enter(orbB, "springIn", .18, .8); enter(orbC, "popIn", .35, .55); loop(orbA, "orbit", .9, 4.8, { intensity: 38 }); loop(orbB, "orbit", .9, 3.4, { intensity: 28 }); loop(orbC, "drift", .9, 2.8, { intensity: 18 }); loop(orbA, "liquid", 1, 2.7, { intensity: .06 }); enter(title, "fadeIn", .55, .7, {}, true, "character"); enter(label, "moveIn", 1.05, .45, { direction: "up", distance: 35 });
  return [orbA, orbB, orbC, title, label];
}

function buildCardStack(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const eyebrow = f.text("Eyebrow", "PRODUCT SYSTEM · 04", f.rect(.02, .04, .48, .04), "label", "#ff8a5b");
  const title = f.text("Title", "CARDS THAT\nMOVE WITH YOU.", f.rect(.02, .15, .43, .26), "headline", "#f7f4ff", { fontSize: 76 * f.unit });
  const subtitle = f.text("Subtitle", "A modular interface story built from reusable motion.", f.rect(.02, .54, .39, .09), "body", "#9b96a8", { fontSize: 25 * f.unit });
  const back = f.card("Back card", f.rect(.58, .17, .29, .58), "#3c314e", { radius: 42 * f.unit, rotation: 12 });
  const mid = f.card("Middle card", f.rect(.55, .16, .29, .58), "#ff8a5b", { radius: 42 * f.unit, rotation: 5 });
  const front = f.card("Front card", f.rect(.51, .15, .29, .58), "linear-gradient(150deg,#ffffff,#e9e5ee)", { radius: 42 * f.unit, shadow: 40 });
  const cardTitle = f.text("Card title", "MOTION\nSYSTEM", f.rect(.56, .27, .19, .14), "title", "#221d2c", { align: "center", fontSize: 48 * f.unit });
  const button = f.card("Card button", f.rect(.57, .62, .17, .06), "#221d2c", { radius: 999 });
  const buttonText = f.text("Button text", "EXPLORE", f.rect(.605, .64, .1, .025), "meta", "#ffffff", { align: "center", fontSize: 15 * f.unit });
  enter(eyebrow, "fadeIn", 0, .4); enter(title, "moveIn", .1, .75, { direction: "up", distance: 80 }, true, "line"); enter(subtitle, "fadeIn", .72, .45); enter(back, "rollIn", .2, .9, { direction: "right", distance: 160, rotation: 160 }); enter(mid, "flipIn", .45, .82); enter(front, "springIn", .7, .82); enter(cardTitle, "stretchIn", 1.05, .55, { axis: "y" }); enter(button, "popIn", 1.25, .4); enter(buttonText, "fadeIn", 1.38, .28); loop(back, "hover", 1.8, 3.3, { intensity: 8 }); loop(mid, "hover", 1.8, 2.9, { intensity: 10 }); loop(front, "hover", 1.8, 2.5, { intensity: 12 });
  return [eyebrow, title, subtitle, back, mid, front, cardTitle, button, buttonText];
}

function buildKineticType(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const top = f.text("Top word", "MAKE", f.rect(.01, .03, .51, .22), "display", "#241b45", { fontSize: 145 * f.unit });
  const middle = f.text("Middle word", "IT", f.rect(.47, .28, .2, .24), "display", "#9f7aea", { fontSize: 170 * f.unit });
  const bottom = f.text("Bottom word", "MOVE", f.rect(.16, .56, .78, .25), "display", "#241b45", { fontSize: 172 * f.unit });
  const accent = f.card("Accent", f.rect(.02, .84, .92, .022), "linear-gradient(90deg,#9f7aea,#62d4ad)", { radius: 999 });
  const note = f.text("Note", "KINETIC TYPE STUDY · 2026", f.rect(.62, .04, .31, .035), "meta", "#786f91", { align: "right" });
  enter(top, "stretchIn", 0, .7, { axis: "x" }); enter(middle, "flipIn", .22, .75, { axis: "y" }); enter(bottom, "slideIn", .42, .75, { direction: "left", distance: 220 }); enter(accent, "wipeIn", .72, .55, { direction: "left" }); enter(note, "fadeIn", .9, .4); loop(middle, "wobble", 1.4, 1.8, { intensity: .035 }); loop(bottom, "drift", 1.5, 3.4, { intensity: 8 });
  return [top, middle, bottom, accent, note];
}

function buildLiquidTitle(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const blobA = f.decorativeCircle("Liquid cyan", sq(f, .04, .04, .5), "linear-gradient(145deg,#79e4ff,#1aa7ce)"); fx(blobA, "waterDrop", 32, 24); fx(blobA, "glow", 24, 30, "#19a7ce");
  const blobB = f.decorativeCircle("Liquid blue", sq(f, .49, .45, .43), "linear-gradient(145deg,#3ab7d8,#126c86)"); fx(blobB, "waterDrop", 26, 22); fx(blobB, "blur", 4, 5);
  const title = f.text("Liquid title", "FLOW\nSTATE", f.rect(.11, .25, .78, .34), "display", "#ffffff", { align: "center", fontSize: 128 * f.unit }); fx(title, "glow", 16, 20, "#ffffff");
  const subtitle = f.text("Subtitle", "ORGANIC MOTION STUDY", f.rect(.22, .71, .56, .045), "label", "#113946", { align: "center" });
  enter(blobA, "elasticIn", 0, 1); enter(blobB, "springIn", .22, .9); loop(blobA, "liquid", 1, 2.6, { intensity: .1 }); loop(blobB, "liquid", 1, 3.1, { intensity: .12 }); loop(blobA, "orbit", 1, 4.5, { intensity: 20 }); enter(title, "zoomBlurIn", .42, .8, {}, true, "line"); loop(title, "ripple", 1.5, 2.4, { intensity: .025 }); enter(subtitle, "fadeIn", 1.15, .45);
  return [blobA, blobB, title, subtitle];
}

function buildGallerySwipe(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const title = f.text("Gallery title", "A WEEKEND\nIN MOTION", f.rect(.02, .01, .72, .15), "headline", "#2a2630", { fontSize: 62 * f.unit });
  const index = f.text("Gallery index", "01  /  03", f.rect(.72, .04, .24, .035), "meta", "#746d7a", { align: "right" });
  const cardA = f.card("Photo A", f.rect(.03, .25, .66, .34), "linear-gradient(145deg,#f4a48b,#d96b60)", { radius: 38 * f.unit, shadow: 26 });
  const cardB = f.card("Photo B", f.rect(.3, .4, .66, .34), "linear-gradient(145deg,#91d8c6,#3da68e)", { radius: 38 * f.unit, shadow: 30 });
  const cardC = f.card("Photo C", f.rect(.08, .58, .66, .28), "linear-gradient(145deg,#b9a6ef,#7052c5)", { radius: 38 * f.unit, shadow: 32 });
  const caption = f.text("Caption", "SWIPE THROUGH THE STORY", f.rect(.16, .91, .68, .03), "meta", "#746d7a", { align: "center" });
  enter(title, "moveIn", 0, .7, { direction: "up", distance: 70 }, true, "line"); enter(index, "fadeIn", .42, .35); enter(cardA, "wipeIn", .35, .7, { direction: "left" }); enter(cardB, "slideIn", .68, .68, { direction: "right", distance: 180 }); enter(cardC, "springIn", 1.02, .78); enter(caption, "fadeIn", 1.35, .4); loop(cardA, "drift", 1.6, 3.6, { intensity: 7 }); loop(cardB, "drift", 1.6, 3.1, { intensity: 9 }); loop(cardC, "hover", 1.6, 2.7, { intensity: 7 });
  return [title, index, cardA, cardB, cardC, caption];
}

function buildSalePoster(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const burst = f.decorativeCircle("Sale burst", sq(f, .55, .01, .42), "radial-gradient(circle,#ff4d8d,#b32368)"); fx(burst, "glow", 34, 42, "#ff4d8d");
  const label = f.text("Sale label", "48 HOURS ONLY", f.rect(.02, .03, .5, .035), "label", "#fff4a3");
  const title = f.text("Sale title", "FLASH\nSALE", f.rect(.02, .15, .72, .34), "display", "#ffffff", { fontSize: 128 * f.unit });
  const discount = f.text("Discount", "50%", f.rect(.08, .54, .72, .19), "display", "#fff4a3", { fontSize: 162 * f.unit });
  const off = f.text("Off", "OFF", f.rect(.68, .64, .18, .07), "title", "#ff4d8d", { fontSize: 46 * f.unit });
  const cta = f.card("CTA", f.rect(.04, .83, .46, .075), "#ffffff", { radius: 999 });
  const ctaText = f.text("CTA text", "SHOP THE DROP  ↗", f.rect(.09, .855, .36, .03), "label", "#1b1630", { align: "center" });
  enter(burst, "zoomBlurIn", 0, .85); loop(burst, "heartbeat", .9, 1.3, { intensity: .08 }); enter(label, "fadeIn", .1, .4); enter(title, "stretchIn", .2, .72, { axis: "y" }, true, "line"); enter(discount, "popIn", .62, .72); enter(off, "rollIn", .86, .6, { direction: "right", distance: 90, rotation: 120 }); enter(cta, "slideIn", 1.12, .55, { direction: "left", distance: 120 }); enter(ctaText, "fadeIn", 1.32, .3); loop(discount, "glowPulse", 1.6, 2, { intensity: 22 });
  return [burst, label, title, discount, off, cta, ctaText];
}

function buildButtonMicro(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const title = f.text("Title", "MICROINTERACTIONS\nMAKE PRODUCTS FEEL ALIVE.", f.rect(.02, .08, .56, .24), "headline", "#171821", { fontSize: 62 * f.unit });
  const subtitle = f.text("Subtitle", "A focused button state study", f.rect(.02, .39, .42, .045), "body", "#77717f", { fontSize: 22 * f.unit });
  const glow = f.decorativeCard("Button glow", f.rect(.58, .31, .31, .21), "rgba(114,84,214,.28)", { radius: 999 }); fx(glow, "blur", 24, 30);
  const button = f.card("Action button", f.rect(.57, .35, .32, .14), "linear-gradient(180deg,#8468e7,#674bc5)", { radius: 999, shadow: 28 }); fx(button, "glow", 16, 18, "#7254d6");
  const buttonText = f.text("Button label", "CREATE MOTION", f.rect(.62, .4, .22, .035), "label", "#ffffff", { align: "center" });
  const cursor = f.text("Cursor", "↗", f.rect(.8, .55, .08, .075), "title", "#171821", { align: "center", fontSize: 50 * f.unit });
  const hint = f.text("Hint", "HOVER · PRESS · RELEASE", f.rect(.59, .7, .31, .035), "meta", "#8b8593", { align: "center" });
  enter(title, "moveIn", 0, .72, { direction: "up", distance: 70 }, true, "line"); enter(subtitle, "fadeIn", .55, .4); enter(glow, "scaleIn", .35, .7); enter(button, "springIn", .5, .78); enter(buttonText, "fadeIn", .78, .3); enter(cursor, "slideIn", .95, .55, { direction: "down", distance: 80 }); enter(hint, "fadeIn", 1.2, .35); loop(button, "heartbeat", 1.5, 1.6, { intensity: .045 }); loop(cursor, "jiggle", 1.6, 1.2, { intensity: 3 });
  return [title, subtitle, glow, button, buttonText, cursor, hint];
}

function buildChartReveal(scene: Scene): Layer[] {
  const f = createTemplateFrame(scene);
  const label = f.text("Dashboard label", "PERFORMANCE · Q3", f.rect(.01, .04, .4, .035), "label", "#67e8c3");
  const title = f.text("Dashboard title", "GROWTH\nAT A GLANCE", f.rect(.01, .14, .38, .2), "headline", "#f4f7fb", { fontSize: 66 * f.unit });
  const note = f.text("Chart note", "Motion increased completed views", f.rect(.01, .53, .32, .075), "body", "#a9b2c2", { fontSize: 24 * f.unit });
  const panel = f.card("Chart panel", f.rect(.45, .09, .5, .76), "rgba(255,255,255,.06)", { radius: 34 * f.unit }); fx(panel, "glass", 48, 18);
  const value = f.text("Chart value", "+38.4%", f.rect(.52, .19, .34, .1), "headline", "#67e8c3", { fontSize: 68 * f.unit });
  const valueLabel = f.text("Value label", "CONVERSION LIFT", f.rect(.53, .31, .27, .03), "meta", "#a9b2c2");
  const baseline = f.card("Chart baseline", f.rect(.53, .71, .31, .007), "rgba(255,255,255,.16)", { radius: 999 });
  const barA = f.card("Bar A", f.rect(.55, .56, .035, .15), "#39566a", { radius: 999 });
  const barB = f.card("Bar B", f.rect(.62, .5, .035, .21), "#497a7a", { radius: 999 });
  const barC = f.card("Bar C", f.rect(.69, .42, .035, .29), "#5bb99e", { radius: 999 });
  const barD = f.card("Bar D", f.rect(.76, .33, .035, .38), "#67e8c3", { radius: 999 }); fx(barD, "glow", 18, 18, "#67e8c3");
  enter(label, "fadeIn", 0, .4); enter(title, "moveIn", .12, .7, { direction: "up", distance: 70 }, true, "line"); enter(note, "fadeIn", .72, .42); enter(panel, "springIn", .25, .82); enter(value, "stretchIn", .65, .58, { axis: "x" }); enter(valueLabel, "fadeIn", .82, .35); enter(baseline, "wipeIn", .88, .42, { direction: "left" }); enter(barA, "stretchIn", 1.05, .5, { axis: "y" }); enter(barB, "stretchIn", 1.18, .5, { axis: "y" }); enter(barC, "stretchIn", 1.31, .5, { axis: "y" }); enter(barD, "stretchIn", 1.44, .5, { axis: "y" }); loop(barD, "glowPulse", 2, 2.2, { intensity: 16 });
  return [label, title, note, panel, value, valueLabel, baseline, barA, barB, barC, barD];
}

function sq(frame: TemplateFrame, x: number, y: number, width: number): TemplateRect {
  return frame.rect(x, y, width, width * frame.safe.width / frame.safe.height);
}

function fx(layer: Layer, type: LayerEffectType, intensity: number, radius: number, color?: string) {
  layer.effects = [...(layer.effects ?? []), {
    id: `effect-${layer.id}-${type}-${layer.effects?.length ?? 0}`,
    type,
    enabled: true,
    intensity,
    radius,
    speed: type === "waterDrop" || type === "ripple" || type === "grain" || type === "hueShift" ? 1 : 0,
    color,
    seed: 42 + (layer.effects?.length ?? 0),
  }];
}

function enter(layer: Layer, type: AnimationType, startTime: number, duration: number, parameters: Record<string, number | string | boolean> = {}, stagger = false, unit: "line" | "word" | "character" = "line") {
  layer.animationActions.push(createAnimationAction(layer.id, "in", type, {
    startTime,
    duration,
    easing: recommendedEasing(type, "in"),
    parameters,
    stagger: stagger ? { enabled: true, unit, delay: unit === "character" ? .035 : .08, order: "normal", seed: 42 } : undefined,
  }));
}

function loop(layer: Layer, type: AnimationType, startTime: number, duration: number, parameters: Record<string, number | string | boolean>) {
  layer.animationActions.push(createAnimationAction(layer.id, "loop", type, {
    startTime,
    duration,
    easing: type === "spin" || type === "orbit" || type === "shake" || type === "jiggle" ? "linear" : "easeInOut",
    parameters,
    repeat: { count: "infinite", delay: 0 },
  }));
}

function out(layer: Layer, scene: Scene, type: AnimationType, duration: number, parameters: Record<string, number | string | boolean> = {}) {
  layer.animationActions.push(createAnimationAction(layer.id, "out", type, {
    startTime: Math.max(0, scene.duration - duration),
    duration,
    easing: recommendedEasing(type, "out"),
    parameters,
  }));
}

function recommendedEasing(type: AnimationType, category: "in" | "out") {
  if (["springIn", "elasticIn"].includes(type)) return "elastic" as const;
  if (["popIn", "scaleIn", "rotateIn", "flipIn", "stretchIn"].includes(type)) return "backOut" as const;
  if (type === "dropIn") return "bounce" as const;
  if (category === "out" && ["popOut", "flipOut"].includes(type)) return "backIn" as const;
  return category === "out" ? "easeIn" as const : "easeOut" as const;
}
