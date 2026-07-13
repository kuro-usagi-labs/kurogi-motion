import type { CreateProjectOptions, ProjectFormat } from "./project";
import {
  addLayers,
  createAnimationAction,
  createProject,
  createShapeLayer,
  createTextLayer,
  getActiveScene,
} from "./project";
import type {
  AnimationType,
  KurogiProject,
  Layer,
  LayerEffectType,
  Scene,
  TextLayer,
} from "../types";

export type TemplateCategory = "Social" | "Marketing" | "Brand" | "UI" | "Typography";

export interface MotionTemplateDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  format: Exclude<ProjectFormat, "custom">;
  duration: number;
  description: string;
  palette: [string, string, string];
  preview:
    | "chat"
    | "comment"
    | "notification"
    | "product"
    | "quote"
    | "logo"
    | "announcement"
    | "lower-third"
    | "phone"
    | "countdown"
    | "testimonial"
    | "stat"
    | "orbit"
    | "stack"
    | "kinetic"
    | "liquid"
    | "gallery"
    | "sale"
    | "button"
    | "chart";
}

export const MOTION_TEMPLATES: MotionTemplateDefinition[] = [
  { id: "chatbox", name: "Chatbox conversation", category: "Social", format: "vertical", duration: 6, description: "Layered message bubbles with polished staggered replies.", palette: ["#dfe7ff", "#7c5cff", "#17192b"], preview: "chat" },
  { id: "comment", name: "Comment spotlight", category: "Social", format: "square", duration: 5, description: "A premium viewer comment card with reaction micro-motion.", palette: ["#fff4df", "#ff8a5b", "#24212c"], preview: "comment" },
  { id: "notification", name: "App notification", category: "UI", format: "vertical", duration: 4.5, description: "A glass notification stack for product demos and launches.", palette: ["#11131c", "#67e8c3", "#f4f5fa"], preview: "notification" },
  { id: "product", name: "Product reveal", category: "Marketing", format: "square", duration: 6, description: "A bold product launch scene with orbiting labels and depth.", palette: ["#f8f4ff", "#9f7aea", "#261b43"], preview: "product" },
  { id: "quote", name: "Editorial quote", category: "Typography", format: "portrait", duration: 5.5, description: "Large kinetic typography with warm editorial accents.", palette: ["#fff1e8", "#f08c72", "#4b2730"], preview: "quote" },
  { id: "logo", name: "Liquid logo reveal", category: "Brand", format: "landscape", duration: 5.5, description: "An elastic logo reveal with luminous liquid distortion.", palette: ["#11121a", "#a78bfa", "#f4f1ff"], preview: "logo" },
  { id: "announcement", name: "Collection announcement", category: "Social", format: "vertical", duration: 5.5, description: "Mask-driven announcement layout with playful accents.", palette: ["#dffbf2", "#62d4ad", "#163c31"], preview: "announcement" },
  { id: "lower-third", name: "Creator lower third", category: "Brand", format: "landscape", duration: 6, description: "A broadcast-ready identity strip with clean exits.", palette: ["#11131d", "#8b5cf6", "#ffffff"], preview: "lower-third" },
  { id: "app-promo", name: "App feature showcase", category: "UI", format: "vertical", duration: 6.5, description: "A phone-style product scene with floating feature cards.", palette: ["#eef2ff", "#5b67f1", "#11152b"], preview: "phone" },
  { id: "countdown", name: "Launch countdown", category: "Marketing", format: "square", duration: 5, description: "High-impact countdown type with glow and heartbeat motion.", palette: ["#12131b", "#ffcc66", "#f7f4ff"], preview: "countdown" },
  { id: "testimonial", name: "Customer testimonial", category: "Marketing", format: "portrait", duration: 6, description: "A premium review card with expressive staggered copy.", palette: ["#f4efff", "#7c5cff", "#2d2442"], preview: "testimonial" },
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
  const scene = getActiveScene(project);
  const layers = buildTemplateLayers(scene, templateId);
  const definition = MOTION_TEMPLATES.find((item) => item.id === templateId);
  if (definition) project.scenes[scene.id].background = { type: "solid", color: definition.palette[0] };
  return addLayers(project, layers);
}

function buildTemplateLayers(scene: Scene, id: string): Layer[] {
  switch (id) {
    case "chatbox": return buildChatbox(scene);
    case "comment": return buildComment(scene);
    case "notification": return buildNotification(scene);
    case "product": return buildProduct(scene);
    case "quote": return buildQuote(scene);
    case "logo": return buildLogo(scene);
    case "announcement": return buildAnnouncement(scene);
    case "lower-third": return buildLowerThird(scene);
    case "app-promo": return buildAppPromo(scene);
    case "countdown": return buildCountdown(scene);
    case "testimonial": return buildTestimonial(scene);
    case "stat-card": return buildStatCard(scene);
    case "gradient-orbit": return buildGradientOrbit(scene);
    case "card-stack": return buildCardStack(scene);
    case "kinetic-type": return buildKineticType(scene);
    case "liquid-title": return buildLiquidTitle(scene);
    case "gallery-swipe": return buildGallerySwipe(scene);
    case "sale-poster": return buildSalePoster(scene);
    case "button-micro": return buildButtonMicro(scene);
    case "chart-reveal": return buildChartReveal(scene);
    default: return [];
  }
}

function buildChatbox(scene: Scene): Layer[] {
  const eyebrow = text(scene, "Conversation label", "TEAM CHAT · LIVE", .09, .055, .82, .05, 25, "#5d6280");
  const title = text(scene, "Conversation title", "IDEAS MOVE\nFASTER TOGETHER.", .09, .105, .82, .18, 70, "#17192b");
  const bubbleA = card(scene, "Message from Alex", .08, .34, .76, .15, "#ffffff", 42); shadow(bubbleA, 24);
  const avatarA = circle(scene, "Alex avatar", .115, .375, .085, "#ff8a5b");
  const messageA = text(scene, "Message text", "Alex · 09:42\nThe launch draft is ready ✨", .225, .365, .56, .09, 34, "#202235");
  const bubbleB = card(scene, "Reply bubble", .21, .54, .71, .15, "linear-gradient(135deg,#8c68ff,#6e4fe2)", 42); shadow(bubbleB, 26);
  const messageB = text(scene, "Reply text", "Perfect. Let’s make it move.", .27, .59, .57, .06, 37, "#ffffff");
  const typing = card(scene, "Typing indicator", .09, .75, .26, .07, "rgba(255,255,255,.72)", 999);
  const dots = text(scene, "Typing dots", "●  ●  ●", .145, .765, .15, .03, 19, "#7c5cff");
  enter(eyebrow, "fadeIn", 0, .4); enter(title, "moveIn", .08, .7, { direction: "up", distance: 80 }, true, "line");
  enter(bubbleA, "springIn", .42, .75); enter(avatarA, "popIn", .62, .45); enter(messageA, "fadeIn", .72, .42);
  enter(bubbleB, "slideIn", 1.05, .65, { direction: "right", distance: 180 }); enter(messageB, "fadeIn", 1.28, .4);
  enter(typing, "popIn", 1.72, .42); enter(dots, "fadeIn", 1.85, .3); loop(dots, "heartbeat", 2.1, 1.25, { intensity: .12 }); loop(bubbleB, "hover", 1.8, 2.8, { intensity: 8 });
  out(typing, scene, "fadeOut", .4); out(dots, scene, "fadeOut", .35);
  return [eyebrow, title, bubbleA, avatarA, messageA, bubbleB, messageB, typing, dots];
}

function buildComment(scene: Scene): Layer[] {
  const halo = circle(scene, "Soft halo", .68, .08, .42, "radial-gradient(circle,#ffc4a7,rgba(255,196,167,0))");
  halo.opacity = .62; fx(halo, "blur", 22, 26);
  const cardLayer = card(scene, "Comment card", .1, .2, .8, .58, "rgba(255,255,255,.92)", 54); shadow(cardLayer, 38); fx(cardLayer, "glass", 35, 18);
  const avatar = circle(scene, "Avatar", .15, .28, .12, "linear-gradient(145deg,#ff9c70,#ff6b5e)");
  const user = text(scene, "Username", "@creativefriend", .3, .275, .52, .06, 30, "#24212c");
  const badge = card(scene, "Creator badge", .69, .285, .13, .04, "#f1ecff", 999);
  const badgeText = text(scene, "Badge text", "CREATOR", .71, .296, .09, .02, 14, "#6b4dc3"); center(badgeText);
  const comment = text(scene, "Comment", "“This animation made the whole post feel premium.”", .15, .405, .7, .18, 46, "#24212c");
  const likes = text(scene, "Likes", "♥  1,284", .15, .68, .25, .05, 24, "#ff5d78");
  const reply = text(scene, "Reply", "Reply  ·  Share", .58, .68, .25, .05, 20, "#77717f"); reply.style.align = "right";
  enter(halo, "scaleIn", 0, .8); loop(halo, "breathe", .8, 2.2, { intensity: .1 });
  enter(cardLayer, "springIn", .08, .8); enter(avatar, "popIn", .32, .45); enter(user, "slideIn", .4, .52, { direction: "left", distance: 90 });
  enter(badge, "stretchIn", .55, .48, { axis: "x" }); enter(badgeText, "fadeIn", .68, .3); enter(comment, "moveIn", .66, .68, { direction: "up", distance: 70 }, true, "word"); enter(likes, "popIn", 1.18, .42); enter(reply, "fadeIn", 1.28, .36);
  loop(avatar, "glowPulse", 1.25, 2.1, { intensity: 16 }); loop(likes, "heartbeat", 1.6, 1.35, { intensity: .09 });
  return [halo, cardLayer, avatar, user, badge, badgeText, comment, likes, reply];
}

function buildNotification(scene: Scene): Layer[] {
  const glow = circle(scene, "Ambient glow", .12, .12, .76, "radial-gradient(circle,#5f6cd9,rgba(95,108,217,0))"); glow.opacity = .48; fx(glow, "blur", 36, 40);
  const title = text(scene, "Section title", "PRODUCT UPDATE", .1, .1, .8, .06, 32, "#67e8c3");
  const headline = text(scene, "Headline", "THE WORKFLOW\nJUST GOT LIGHTER.", .1, .17, .8, .18, 64, "#f4f5fa");
  const cardBack = card(scene, "Back notification", .12, .39, .76, .19, "rgba(45,49,66,.58)", 48); cardBack.opacity = .55; cardBack.rotation = -4; fx(cardBack, "glass", 48, 20);
  const cardLayer = card(scene, "Notification", .08, .42, .84, .24, "rgba(36,39,52,.86)", 48); shadow(cardLayer, 42); fx(cardLayer, "glass", 62, 24);
  const icon = circle(scene, "App icon", .13, .475, .14, "linear-gradient(145deg,#7cf3d5,#4fc8ad)"); fx(icon, "glow", 25, 22, "#67e8c3");
  const symbol = text(scene, "App symbol", "K", .165, .5, .07, .05, 42, "#15231f"); center(symbol);
  const copy = text(scene, "Notification copy", "Kurogi Motion\nYour ProRes export is ready.", .32, .47, .5, .11, 39, "#f4f5fa");
  const time = text(scene, "Notification time", "now", .78, .45, .1, .04, 22, "#9ca2b4"); time.style.align = "right";
  const footer = text(scene, "Footer", "Tap to reveal your animation", .17, .72, .66, .04, 24, "#81889a"); center(footer);
  enter(glow, "zoomBlurIn", 0, .9); enter(title, "fadeIn", .08, .42); enter(headline, "moveIn", .16, .75, { direction: "up", distance: 80 }, true, "line");
  enter(cardBack, "flipIn", .52, .7); enter(cardLayer, "springIn", .7, .8); enter(icon, "popIn", .95, .48); enter(symbol, "fadeIn", 1.06, .3); enter(copy, "fadeIn", 1.12, .48); enter(time, "fadeIn", 1.28, .3); enter(footer, "moveIn", 1.45, .5, { direction: "up", distance: 40 });
  loop(cardLayer, "hover", 1.8, 3, { intensity: 7 }); loop(icon, "glowPulse", 1.6, 2, { intensity: 20 });
  return [glow, title, headline, cardBack, cardLayer, icon, symbol, copy, time, footer];
}

function buildProduct(scene: Scene): Layer[] {
  const orbA = circle(scene, "Purple orb", .55, .08, .46, "linear-gradient(145deg,#b89aff,#7d55e7)"); fx(orbA, "blur", 8, 10); fx(orbA, "glow", 22, 30, "#9f7aea");
  const orbB = circle(scene, "Mint orb", -.08, .66, .34, "linear-gradient(145deg,#9af4d7,#62d4ad)"); fx(orbB, "blur", 5, 8);
  const product = card(scene, "Product card", .52, .18, .36, .58, "linear-gradient(155deg,#9f7aea,#6d46c7)", 58); shadow(product, 48); fx(product, "glass", 22, 14);
  const inner = card(scene, "Product face", .57, .25, .26, .36, "linear-gradient(160deg,#ffffff,#e9e1ff)", 38);
  const mark = text(scene, "Product mark", "K", .635, .355, .13, .13, 110, "#5d3dae"); center(mark);
  const title = text(scene, "Launch headline", "NEW\nDROP.", .075, .16, .48, .3, 122, "#261b43");
  const subtitle = text(scene, "Subtitle", "DESIGNED TO MOVE", .08, .62, .39, .05, 25, "#6e6688");
  const badge = card(scene, "Launch badge", .08, .71, .27, .07, "#261b43", 999);
  const badgeText = text(scene, "Badge text", "LIMITED EDITION", .115, .73, .2, .03, 17, "#ffffff"); center(badgeText);
  enter(orbA, "zoomBlurIn", 0, .9); enter(orbB, "scaleIn", .15, .7); loop(orbA, "orbit", .8, 4, { intensity: 18 }); loop(orbB, "drift", .8, 3.4, { intensity: 14 });
  enter(product, "springIn", .2, .9); enter(inner, "flipIn", .52, .75); enter(mark, "popIn", .78, .48); loop(product, "hover", 1.15, 2.8, { intensity: 13 }); loop(mark, "glowPulse", 1.25, 2, { intensity: 14 });
  enter(title, "stretchIn", .05, .72, { axis: "y" }, true, "line"); enter(subtitle, "slideIn", .55, .55, { direction: "left", distance: 100 }); enter(badge, "popIn", .82, .45); enter(badgeText, "fadeIn", .96, .3);
  return [orbA, orbB, product, inner, mark, title, subtitle, badge, badgeText];
}

function buildQuote(scene: Scene): Layer[] {
  const line = card(scene, "Accent line", .09, .09, .16, .012, "#f08c72", 999);
  const quoteMark = text(scene, "Quote mark", "“", .08, .14, .18, .13, 150, "#f08c72");
  const quote = text(scene, "Quote", "MAKE\nEVERY IDEA\nMOVE.", .1, .24, .8, .48, 104, "#4b2730");
  const byline = text(scene, "Byline", "— KUROGI CREATIVE SYSTEM", .1, .78, .62, .04, 23, "#8a5b65");
  const accentA = circle(scene, "Accent A", .72, .68, .19, "linear-gradient(145deg,#f5a58e,#ef735f)"); fx(accentA, "waterDrop", 18, 12);
  const accentB = circle(scene, "Accent B", .82, .61, .1, "#ffd2c4");
  enter(line, "stretchIn", 0, .55, { axis: "x" }); enter(quoteMark, "popIn", .15, .55); enter(quote, "moveIn", .28, .8, { direction: "up", distance: 95 }, true, "word"); enter(byline, "fadeIn", 1.05, .45);
  enter(accentA, "springIn", .48, .75); enter(accentB, "popIn", .72, .5); loop(accentA, "liquid", 1.2, 2.5, { intensity: .09 }); loop(accentB, "orbit", 1.2, 3.2, { intensity: 12 });
  return [line, quoteMark, quote, byline, accentA, accentB];
}

function buildLogo(scene: Scene): Layer[] {
  const glow = circle(scene, "Logo glow", .31, .1, .38, "radial-gradient(circle,#8d68f0,rgba(141,104,240,0))"); fx(glow, "blur", 30, 36); glow.opacity = .62;
  const ring = circle(scene, "Outer ring", .42, .22, .16, "rgba(255,255,255,.04)"); ring.style.stroke = "#a78bfa"; ring.style.strokeWidth = 5;
  const mark = card(scene, "Logo block", .435, .29, .13, .23, "linear-gradient(145deg,#b39aff,#7249dd)", 48); fx(mark, "waterDrop", 16, 10); fx(mark, "glow", 30, 32, "#9f7aea");
  const letter = text(scene, "Logo letter", "K", .46, .345, .08, .09, 78, "#ffffff"); center(letter);
  const name = text(scene, "Brand name", "KUROGI MOTION", .24, .65, .52, .09, 54, "#f4f1ff"); center(name);
  const tagline = text(scene, "Tagline", "CREATE MOTION, NOT KEYFRAMES", .27, .75, .46, .04, 18, "#9993aa"); center(tagline);
  enter(glow, "zoomBlurIn", 0, 1); loop(glow, "breathe", .9, 2.4, { intensity: .12 }); enter(ring, "scaleIn", .08, .8); loop(ring, "spin", .8, 5, { turns: 1 });
  enter(mark, "elasticIn", .2, 1); enter(letter, "fadeIn", .62, .4); loop(mark, "liquid", 1.15, 2.6, { intensity: .065 });
  enter(name, "fadeIn", .75, .6, {}, true, "character"); enter(tagline, "moveIn", 1.15, .5, { direction: "up", distance: 36 });
  return [glow, ring, mark, letter, name, tagline];
}

function buildAnnouncement(scene: Scene): Layer[] {
  const top = text(scene, "Top label", "SEASON 02 · 2026", .1, .08, .8, .04, 22, "#4b826f");
  const title = text(scene, "Announcement", "THE NEW\nCOLLECTION\nIS HERE.", .1, .17, .8, .4, 102, "#163c31");
  const pill = card(scene, "Announcement pill", .11, .64, .48, .085, "linear-gradient(90deg,#62d4ad,#8ae6c6)", 999);
  const label = text(scene, "Pill label", "EXPLORE THE DROP", .16, .665, .38, .04, 22, "#163c31"); center(label);
  const arrow = text(scene, "Arrow", "↗", .65, .625, .18, .13, 92, "#163c31"); center(arrow);
  const blob = circle(scene, "Liquid blob", .66, .17, .29, "linear-gradient(145deg,#8ae6c6,#42b993)"); fx(blob, "waterDrop", 24, 18); fx(blob, "glow", 12, 16, "#62d4ad");
  enter(top, "fadeIn", 0, .4); enter(title, "wipeIn", .1, .85, { direction: "left" }, true, "line"); enter(blob, "springIn", .38, .8); loop(blob, "liquid", 1, 2.4, { intensity: .09 });
  enter(pill, "slideIn", .68, .6, { direction: "left", distance: 120 }); enter(label, "fadeIn", .9, .35); enter(arrow, "rollIn", .78, .7, { direction: "right", distance: 80, rotation: 150 }); loop(arrow, "jiggle", 1.5, 1.2, { intensity: 4 });
  return [top, title, pill, label, arrow, blob];
}

function buildLowerThird(scene: Scene): Layer[] {
  const glow = card(scene, "Accent glow", .055, .645, .6, .24, "rgba(139,92,246,.18)", 38); fx(glow, "blur", 20, 30);
  const bar = card(scene, "Lower third bar", .07, .68, .54, .18, "linear-gradient(110deg,#8b5cf6,#5e3bb8)", 28); shadow(bar, 26); fx(bar, "glass", 18, 10);
  const avatar = circle(scene, "Avatar", .09, .715, .1, "#ffffff");
  const initials = text(scene, "Initials", "GC", .112, .75, .055, .035, 24, "#5e3bb8"); center(initials);
  const name = text(scene, "Creator name", "GILANG CREATIVE", .22, .708, .34, .055, 41, "#ffffff");
  const role = text(scene, "Creator role", "MOTION DESIGNER", .22, .775, .3, .035, 20, "#d8ccff");
  const line = card(scene, "Accent line", .22, .83, .12, .008, "#ffffff", 999);
  enter(glow, "fadeIn", .1, .5); enter(bar, "slideIn", .18, .7, { direction: "left", distance: 210 }); enter(avatar, "popIn", .55, .45); enter(initials, "fadeIn", .7, .3); enter(name, "moveIn", .58, .5, { direction: "left", distance: 70 }); enter(role, "fadeIn", .8, .35); enter(line, "stretchIn", .9, .4, { axis: "x" });
  out(glow, scene, "fadeOut", .45); out(bar, scene, "slideOut", .6, { direction: "left", distance: 210 }); out(avatar, scene, "popOut", .42); out(initials, scene, "fadeOut", .3); out(name, scene, "fadeOut", .4); out(role, scene, "fadeOut", .35); out(line, scene, "stretchOut", .35, { axis: "x" });
  return [glow, bar, avatar, initials, name, role, line];
}

function buildAppPromo(scene: Scene): Layer[] {
  const title = text(scene, "Feature headline", "YOUR WORKFLOW\nJUST GOT FASTER.", .08, .07, .84, .2, 67, "#11152b");
  const subtitle = text(scene, "Feature subtitle", "Design, animate, and export without leaving the flow.", .09, .285, .72, .07, 25, "#5c6485");
  const phoneShadow = card(scene, "Phone glow", .2, .39, .6, .49, "rgba(91,103,241,.22)", 70); fx(phoneShadow, "blur", 25, 32);
  const phone = card(scene, "Phone frame", .24, .36, .52, .5, "#11152b", 64); shadow(phone, 46);
  const screen = card(scene, "Phone screen", .275, .405, .45, .405, "linear-gradient(155deg,#6976ff,#4d57d7)", 46);
  const cardA = card(scene, "Feature card A", .31, .47, .38, .105, "rgba(255,255,255,.92)", 28);
  const cardAText = text(scene, "Feature A", "LIVE PREVIEW", .355, .505, .29, .035, 22, "#11152b"); center(cardAText);
  const cardB = card(scene, "Feature card B", .34, .61, .32, .105, "rgba(255,255,255,.18)", 28); fx(cardB, "glass", 35, 12);
  const cardBText = text(scene, "Feature B", "ONE-TAP MOTION", .375, .645, .25, .035, 19, "#ffffff"); center(cardBText);
  enter(title, "moveIn", 0, .7, { direction: "up", distance: 80 }, true, "line"); enter(subtitle, "fadeIn", .5, .45); enter(phoneShadow, "zoomBlurIn", .25, .8); enter(phone, "springIn", .38, .85); enter(screen, "fadeIn", .7, .45); enter(cardA, "slideIn", .88, .55, { direction: "left", distance: 90 }); enter(cardAText, "fadeIn", 1.05, .3); enter(cardB, "slideIn", 1.15, .55, { direction: "right", distance: 90 }); enter(cardBText, "fadeIn", 1.32, .3);
  loop(phone, "hover", 1.7, 3.1, { intensity: 9 }); loop(cardA, "pulse", 1.7, 1.8, { intensity: .025 }); loop(cardB, "glowPulse", 1.8, 2.2, { intensity: 10 });
  return [title, subtitle, phoneShadow, phone, screen, cardA, cardAText, cardB, cardBText];
}

function buildCountdown(scene: Scene): Layer[] {
  const ring = circle(scene, "Countdown ring", .19, .17, .62, "rgba(255,204,102,.04)"); ring.style.stroke = "#ffcc66"; ring.style.strokeWidth = 5; fx(ring, "glow", 25, 26, "#ffcc66");
  const label = text(scene, "Countdown label", "LAUNCHING IN", .22, .18, .56, .06, 30, "#ffcc66"); center(label);
  const number = text(scene, "Countdown number", "03", .18, .29, .64, .38, 260, "#f7f4ff"); center(number); fx(number, "glow", 18, 20, "#8b5cf6");
  const footer = text(scene, "Countdown footer", "SAVE THE DATE · 13 JULY", .2, .76, .6, .05, 24, "#a6a2b3"); center(footer);
  const dotA = circle(scene, "Orbit dot A", .48, .13, .04, "#ffcc66"); const dotB = circle(scene, "Orbit dot B", .48, .84, .04, "#8b5cf6");
  enter(ring, "scaleIn", 0, .8); loop(ring, "spin", .8, 6, { turns: 1 }); enter(label, "fadeIn", .12, .4); enter(number, "popIn", .22, .75); loop(number, "heartbeat", 1.1, 1.25, { intensity: .08 }); enter(footer, "moveIn", .72, .5, { direction: "up", distance: 45 }); enter(dotA, "popIn", .45, .4); enter(dotB, "popIn", .6, .4); loop(dotA, "orbit", 1, 2.8, { intensity: 16 }); loop(dotB, "orbit", 1, 3.2, { intensity: 14 });
  return [ring, label, number, footer, dotA, dotB];
}

function buildTestimonial(scene: Scene): Layer[] {
  const blob = circle(scene, "Backdrop blob", .58, .04, .5, "linear-gradient(145deg,#c8b2ff,#8d68ed)"); blob.opacity = .52; fx(blob, "blur", 22, 26); fx(blob, "waterDrop", 12, 10);
  const cardLayer = card(scene, "Testimonial card", .08, .15, .84, .7, "rgba(255,255,255,.93)", 56); shadow(cardLayer, 42); fx(cardLayer, "glass", 20, 12);
  const quoteMark = text(scene, "Quote mark", "“", .12, .2, .14, .1, 130, "#7c5cff");
  const avatar = circle(scene, "Customer avatar", .15, .31, .14, "linear-gradient(145deg,#9270ef,#6541bd)");
  const initials = text(scene, "Customer initials", "NP", .18, .35, .08, .05, 28, "#ffffff"); center(initials);
  const name = text(scene, "Customer name", "Nadia Pratama", .34, .325, .45, .05, 28, "#2d2442");
  const role = text(scene, "Customer role", "Social Media Designer", .34, .38, .45, .04, 20, "#827895");
  const quote = text(scene, "Review quote", "I made three polished ad variations before lunch — without touching a keyframe.", .15, .5, .7, .2, 47, "#2d2442");
  const stars = text(scene, "Rating", "★★★★★", .15, .74, .32, .04, 25, "#ffb84d");
  enter(blob, "zoomBlurIn", 0, .9); loop(blob, "liquid", .9, 2.8, { intensity: .07 }); enter(cardLayer, "springIn", .1, .85); enter(quoteMark, "popIn", .35, .48); enter(avatar, "popIn", .48, .46); enter(initials, "fadeIn", .62, .3); enter(name, "slideIn", .58, .5, { direction: "left", distance: 80 }); enter(role, "fadeIn", .78, .35); enter(quote, "moveIn", .82, .7, { direction: "up", distance: 65 }, true, "word"); enter(stars, "stretchIn", 1.35, .5, { axis: "x" }); loop(stars, "glowPulse", 1.8, 2.2, { intensity: 12 });
  return [blob, cardLayer, quoteMark, avatar, initials, name, role, quote, stars];
}

function buildStatCard(scene: Scene): Layer[] {
  const back = card(scene, "Backdrop card", .13, .14, .76, .66, "rgba(40,184,148,.18)", 58); back.rotation = -4; fx(back, "blur", 4, 5);
  const cardLayer = card(scene, "Metric card", .09, .18, .82, .64, "rgba(255,255,255,.94)", 58); shadow(cardLayer, 36);
  const eyebrow = text(scene, "Metric label", "CAMPAIGN LIFT", .16, .28, .5, .05, 27, "#28b894");
  const metric = text(scene, "Metric", "+42%", .14, .38, .72, .22, 150, "#15342d"); fx(metric, "grain", 8, 0);
  const detail = text(scene, "Metric detail", "More completed views after adding motion.", .16, .66, .66, .08, 27, "#607b73");
  const chip = card(scene, "Trend chip", .64, .28, .2, .06, "#d9fff3", 999);
  const chipText = text(scene, "Trend text", "↗  12.8%", .685, .3, .12, .025, 18, "#19866c"); center(chipText);
  const dotA = circle(scene, "Data dot A", .73, .69, .055, "#28b894"); const dotB = circle(scene, "Data dot B", .8, .63, .035, "#9ce7d1");
  enter(back, "rotateIn", 0, .72); enter(cardLayer, "springIn", .12, .8); enter(eyebrow, "fadeIn", .38, .35); enter(metric, "moveIn", .48, .72, { direction: "up", distance: 80 }, true, "character"); enter(detail, "fadeIn", 1.05, .42); enter(chip, "popIn", .82, .44); enter(chipText, "fadeIn", .95, .3); enter(dotA, "popIn", 1.15, .42); enter(dotB, "popIn", 1.3, .4); loop(metric, "breathe", 1.6, 2, { intensity: .025 }); loop(dotA, "orbit", 1.6, 2.6, { intensity: 10 }); loop(dotB, "orbit", 1.6, 3.2, { intensity: 7 });
  return [back, cardLayer, eyebrow, metric, detail, chip, chipText, dotA, dotB];
}

function buildGradientOrbit(scene: Scene): Layer[] {
  const orbA = circle(scene, "Violet orbit", .2, .2, .36, "linear-gradient(145deg,#9d79ff,#5e3bd1)"); fx(orbA, "glow", 30, 40, "#845ef7"); fx(orbA, "waterDrop", 18, 12);
  const orbB = circle(scene, "Mint orbit", .52, .42, .28, "linear-gradient(145deg,#89f1d2,#36b999)"); fx(orbB, "glow", 22, 34, "#67e8c3");
  const orbC = circle(scene, "Pink orbit", .4, .18, .16, "linear-gradient(145deg,#ff8fbc,#e34887)");
  const title = text(scene, "Orbit title", "BRAND\nIN MOTION", .1, .67, .8, .18, 84, "#f7f4ff"); center(title);
  const label = text(scene, "Orbit label", "SEAMLESS LOOP · 06 SEC", .25, .88, .5, .03, 18, "#8f8ba0"); center(label);
  enter(orbA, "zoomBlurIn", 0, .9); enter(orbB, "springIn", .18, .8); enter(orbC, "popIn", .35, .55); loop(orbA, "orbit", .9, 4.8, { intensity: 38 }); loop(orbB, "orbit", .9, 3.4, { intensity: 28 }); loop(orbC, "drift", .9, 2.8, { intensity: 18 }); loop(orbA, "liquid", 1, 2.7, { intensity: .06 }); enter(title, "fadeIn", .55, .7, {}, true, "character"); enter(label, "moveIn", 1.05, .45, { direction: "up", distance: 35 });
  return [orbA, orbB, orbC, title, label];
}

function buildCardStack(scene: Scene): Layer[] {
  const eyebrow = text(scene, "Eyebrow", "PRODUCT SYSTEM · 04", .08, .08, .5, .05, 26, "#ff8a5b");
  const title = text(scene, "Title", "CARDS THAT\nMOVE WITH YOU.", .08, .18, .42, .28, 78, "#f7f4ff");
  const subtitle = text(scene, "Subtitle", "A modular interface story built from reusable motion.", .08, .55, .38, .1, 26, "#9b96a8");
  const cardBack = card(scene, "Back card", .56, .19, .3, .57, "#3c314e", 42); cardBack.rotation = 12;
  const cardMid = card(scene, "Middle card", .53, .18, .3, .57, "#ff8a5b", 42); cardMid.rotation = 5;
  const cardFront = card(scene, "Front card", .5, .17, .3, .57, "linear-gradient(150deg,#ffffff,#e9e5ee)", 42); shadow(cardFront, 42);
  const cardTitle = text(scene, "Card title", "MOTION\nSYSTEM", .55, .28, .2, .14, 50, "#221d2c"); center(cardTitle);
  const button = card(scene, "Card button", .56, .62, .18, .06, "#221d2c", 999);
  const buttonText = text(scene, "Button text", "EXPLORE", .6, .64, .1, .025, 16, "#ffffff"); center(buttonText);
  enter(eyebrow, "fadeIn", 0, .4); enter(title, "moveIn", .1, .75, { direction: "up", distance: 80 }, true, "line"); enter(subtitle, "fadeIn", .72, .45);
  enter(cardBack, "rollIn", .2, .9, { direction: "right", distance: 160, rotation: 160 }); enter(cardMid, "flipIn", .45, .82); enter(cardFront, "springIn", .7, .82); enter(cardTitle, "stretchIn", 1.05, .55, { axis: "y" }); enter(button, "popIn", 1.25, .4); enter(buttonText, "fadeIn", 1.38, .28);
  loop(cardBack, "hover", 1.8, 3.3, { intensity: 8 }); loop(cardMid, "hover", 1.8, 2.9, { intensity: 10 }); loop(cardFront, "hover", 1.8, 2.5, { intensity: 12 });
  return [eyebrow, title, subtitle, cardBack, cardMid, cardFront, cardTitle, button, buttonText];
}

function buildKineticType(scene: Scene): Layer[] {
  const top = text(scene, "Top word", "MAKE", .06, .08, .5, .22, 150, "#241b45");
  const middle = text(scene, "Middle word", "IT", .48, .28, .22, .25, 176, "#9f7aea");
  const bottom = text(scene, "Bottom word", "MOVE", .18, .55, .76, .26, 180, "#241b45");
  const accent = card(scene, "Accent", .06, .83, .88, .025, "linear-gradient(90deg,#9f7aea,#62d4ad)", 999);
  const note = text(scene, "Note", "KINETIC TYPE STUDY · 2026", .62, .09, .3, .04, 18, "#786f91"); note.style.align = "right";
  enter(top, "stretchIn", 0, .7, { axis: "x" }); enter(middle, "flipIn", .22, .75, { axis: "y" }); enter(bottom, "slideIn", .42, .75, { direction: "left", distance: 220 }); enter(accent, "wipeIn", .72, .55, { direction: "left" }); enter(note, "fadeIn", .9, .4);
  loop(middle, "wobble", 1.4, 1.8, { intensity: .035 }); loop(bottom, "drift", 1.5, 3.4, { intensity: 8 });
  return [top, middle, bottom, accent, note];
}

function buildLiquidTitle(scene: Scene): Layer[] {
  const blobA = circle(scene, "Liquid cyan", .08, .1, .5, "linear-gradient(145deg,#79e4ff,#1aa7ce)"); fx(blobA, "waterDrop", 32, 24); fx(blobA, "glow", 24, 30, "#19a7ce");
  const blobB = circle(scene, "Liquid blue", .48, .45, .44, "linear-gradient(145deg,#3ab7d8,#126c86)"); fx(blobB, "waterDrop", 26, 22); fx(blobB, "blur", 4, 5);
  const title = text(scene, "Liquid title", "FLOW\nSTATE", .12, .24, .76, .36, 132, "#ffffff"); center(title); fx(title, "glow", 16, 20, "#ffffff");
  const subtitle = text(scene, "Subtitle", "ORGANIC MOTION STUDY", .22, .7, .56, .05, 24, "#113946"); center(subtitle);
  enter(blobA, "elasticIn", 0, 1); enter(blobB, "springIn", .22, .9); loop(blobA, "liquid", 1, 2.6, { intensity: .1 }); loop(blobB, "liquid", 1, 3.1, { intensity: .12 }); loop(blobA, "orbit", 1, 4.5, { intensity: 20 }); enter(title, "zoomBlurIn", .42, .8, {}, true, "line"); loop(title, "ripple", 1.5, 2.4, { intensity: .025 }); enter(subtitle, "fadeIn", 1.15, .45);
  return [blobA, blobB, title, subtitle];
}

function buildGallerySwipe(scene: Scene): Layer[] {
  const title = text(scene, "Gallery title", "A WEEKEND\nIN MOTION", .08, .06, .84, .16, 64, "#2a2630");
  const cardA = card(scene, "Photo A", .08, .29, .64, .38, "linear-gradient(145deg,#f4a48b,#d96b60)", 38); shadow(cardA, 28);
  const cardB = card(scene, "Photo B", .28, .42, .64, .38, "linear-gradient(145deg,#91d8c6,#3da68e)", 38); shadow(cardB, 32);
  const cardC = card(scene, "Photo C", .12, .54, .64, .32, "linear-gradient(145deg,#b9a6ef,#7052c5)", 38); shadow(cardC, 34);
  const index = text(scene, "Gallery index", "01  /  03", .65, .12, .24, .04, 22, "#746d7a"); index.style.align = "right";
  const caption = text(scene, "Caption", "SWIPE THROUGH THE STORY", .16, .9, .68, .035, 19, "#746d7a"); center(caption);
  enter(title, "moveIn", 0, .7, { direction: "up", distance: 70 }, true, "line"); enter(index, "fadeIn", .42, .35); enter(cardA, "wipeIn", .35, .7, { direction: "left" }); enter(cardB, "slideIn", .68, .68, { direction: "right", distance: 180 }); enter(cardC, "springIn", 1.02, .78); enter(caption, "fadeIn", 1.35, .4); loop(cardA, "drift", 1.6, 3.6, { intensity: 7 }); loop(cardB, "drift", 1.6, 3.1, { intensity: 9 }); loop(cardC, "hover", 1.6, 2.7, { intensity: 7 });
  return [title, cardA, cardB, cardC, index, caption];
}

function buildSalePoster(scene: Scene): Layer[] {
  const burst = circle(scene, "Sale burst", .56, .08, .42, "radial-gradient(circle,#ff4d8d,#b32368)"); fx(burst, "glow", 34, 42, "#ff4d8d");
  const label = text(scene, "Sale label", "48 HOURS ONLY", .08, .08, .5, .04, 22, "#fff4a3");
  const title = text(scene, "Sale title", "FLASH\nSALE", .08, .18, .72, .35, 132, "#ffffff");
  const discount = text(scene, "Discount", "50%", .13, .55, .72, .2, 170, "#fff4a3");
  const off = text(scene, "Off", "OFF", .67, .64, .18, .08, 48, "#ff4d8d");
  const cta = card(scene, "CTA", .1, .82, .45, .08, "#ffffff", 999);
  const ctaText = text(scene, "CTA text", "SHOP THE DROP  ↗", .15, .845, .35, .035, 22, "#1b1630"); center(ctaText);
  enter(burst, "zoomBlurIn", 0, .85); loop(burst, "heartbeat", .9, 1.3, { intensity: .08 }); enter(label, "fadeIn", .1, .4); enter(title, "stretchIn", .2, .72, { axis: "y" }, true, "line"); enter(discount, "popIn", .62, .72); enter(off, "rollIn", .86, .6, { direction: "right", distance: 90, rotation: 120 }); enter(cta, "slideIn", 1.12, .55, { direction: "left", distance: 120 }); enter(ctaText, "fadeIn", 1.32, .3); loop(discount, "glowPulse", 1.6, 2, { intensity: 22 });
  return [burst, label, title, discount, off, cta, ctaText];
}

function buildButtonMicro(scene: Scene): Layer[] {
  const title = text(scene, "Title", "MICROINTERACTIONS\nMAKE PRODUCTS FEEL ALIVE.", .08, .1, .55, .24, 64, "#171821");
  const subtitle = text(scene, "Subtitle", "A focused button state study", .08, .39, .42, .05, 23, "#77717f");
  const glow = card(scene, "Button glow", .59, .34, .29, .18, "rgba(114,84,214,.28)", 999); fx(glow, "blur", 24, 30);
  const button = card(scene, "Action button", .57, .36, .31, .14, "linear-gradient(180deg,#8468e7,#674bc5)", 999); shadow(button, 28); fx(button, "glow", 16, 18, "#7254d6");
  const buttonText = text(scene, "Button label", "CREATE MOTION", .62, .405, .21, .04, 22, "#ffffff"); center(buttonText);
  const cursor = text(scene, "Cursor", "↗", .8, .55, .08, .08, 52, "#171821"); center(cursor);
  const hint = text(scene, "Hint", "HOVER · PRESS · RELEASE", .59, .7, .31, .04, 18, "#8b8593"); center(hint);
  enter(title, "moveIn", 0, .72, { direction: "up", distance: 70 }, true, "line"); enter(subtitle, "fadeIn", .55, .4); enter(glow, "scaleIn", .35, .7); enter(button, "springIn", .5, .78); enter(buttonText, "fadeIn", .78, .3); enter(cursor, "slideIn", .95, .55, { direction: "down", distance: 80 }); enter(hint, "fadeIn", 1.2, .35); loop(button, "heartbeat", 1.5, 1.6, { intensity: .045 }); loop(cursor, "jiggle", 1.6, 1.2, { intensity: 3 });
  return [title, subtitle, glow, button, buttonText, cursor, hint];
}

function buildChartReveal(scene: Scene): Layer[] {
  const label = text(scene, "Dashboard label", "PERFORMANCE · Q3", .07, .08, .4, .04, 24, "#67e8c3");
  const title = text(scene, "Dashboard title", "GROWTH\nAT A GLANCE", .07, .16, .36, .22, 68, "#f4f7fb");
  const panel = card(scene, "Chart panel", .46, .12, .47, .72, "rgba(255,255,255,.06)", 34); fx(panel, "glass", 48, 18);
  const value = text(scene, "Chart value", "+38.4%", .53, .2, .32, .1, 70, "#67e8c3");
  const valueLabel = text(scene, "Value label", "CONVERSION LIFT", .54, .31, .25, .035, 18, "#a9b2c2");
  const baseline = card(scene, "Chart baseline", .53, .7, .3, .008, "rgba(255,255,255,.16)", 999);
  const barA = card(scene, "Bar A", .55, .55, .035, .15, "#39566a", 999);
  const barB = card(scene, "Bar B", .62, .49, .035, .21, "#497a7a", 999);
  const barC = card(scene, "Bar C", .69, .41, .035, .29, "#5bb99e", 999);
  const barD = card(scene, "Bar D", .76, .32, .035, .38, "#67e8c3", 999); fx(barD, "glow", 18, 18, "#67e8c3");
  const note = text(scene, "Chart note", "Motion increased completed views", .07, .55, .31, .08, 25, "#a9b2c2");
  enter(label, "fadeIn", 0, .4); enter(title, "moveIn", .12, .7, { direction: "up", distance: 70 }, true, "line"); enter(note, "fadeIn", .72, .42); enter(panel, "springIn", .25, .82); enter(value, "stretchIn", .65, .58, { axis: "x" }); enter(valueLabel, "fadeIn", .82, .35); enter(baseline, "wipeIn", .88, .42, { direction: "left" }); enter(barA, "stretchIn", 1.05, .5, { axis: "y" }); enter(barB, "stretchIn", 1.18, .5, { axis: "y" }); enter(barC, "stretchIn", 1.31, .5, { axis: "y" }); enter(barD, "stretchIn", 1.44, .5, { axis: "y" }); loop(barD, "glowPulse", 2, 2.2, { intensity: 16 });
  return [label, title, panel, value, valueLabel, baseline, barA, barB, barC, barD, note];
}

function text(scene: Scene, name: string, value: string, x: number, y: number, width: number, height: number, fontSize: number, color: string): TextLayer {
  return createTextLayer(scene, { name, text: value, position: pos(scene, x, y), size: size(scene, width, height), fontSize, color });
}

function card(scene: Scene, name: string, x: number, y: number, width: number, height: number, fill: string, radius: number) {
  const layer = createShapeLayer(scene, "rectangle", { name, position: pos(scene, x, y), size: size(scene, width, height), fill });
  layer.style.borderRadius = radius;
  return layer;
}

function circle(scene: Scene, name: string, x: number, y: number, diameter: number, fill: string) {
  return createShapeLayer(scene, "circle", { name, position: pos(scene, x, y), size: size(scene, diameter, diameter), fill });
}

function center(layer: TextLayer) { layer.style.align = "center"; }
function shadow(layer: Extract<Layer, { type: "shape" }>, amount: number) { layer.style.shadow = amount; }
function pos(scene: Scene, x: number, y: number) { return { x: scene.width * x, y: scene.height * y }; }
function size(scene: Scene, width: number, height: number) { return { width: scene.width * width, height: scene.height * height }; }

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

function enter(
  layer: Layer,
  type: AnimationType,
  startTime: number,
  duration: number,
  parameters: Record<string, number | string | boolean> = {},
  stagger = false,
  unit: "line" | "word" | "character" = "line",
) {
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
  if (["dropIn"].includes(type)) return "bounce" as const;
  if (category === "out" && ["popOut", "flipOut"].includes(type)) return "backIn" as const;
  return category === "out" ? "easeIn" as const : "easeOut" as const;
}
