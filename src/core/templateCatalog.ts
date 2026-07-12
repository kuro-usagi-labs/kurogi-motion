import type { CreateProjectOptions, ProjectFormat } from "./project";
import { addLayers, createAnimationAction, createProject, createShapeLayer, createTextLayer, getActiveScene } from "./project";
import type { KurogiProject, Layer, Scene, TextLayer } from "../types";

export type TemplateCategory = "Social" | "Marketing" | "Brand" | "UI" | "Typography";

export interface MotionTemplateDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  format: Exclude<ProjectFormat, "custom">;
  duration: number;
  description: string;
  palette: [string, string, string];
  preview: "chat" | "comment" | "notification" | "product" | "quote" | "logo" | "announcement" | "lower-third" | "phone" | "countdown" | "testimonial" | "stat";
}

export const MOTION_TEMPLATES: MotionTemplateDefinition[] = [
  { id: "chatbox", name: "Chatbox conversation", category: "Social", format: "vertical", duration: 6, description: "Animated message bubbles for stories and short-form content.", palette: ["#dfe7ff", "#7c5cff", "#17192b"], preview: "chat" },
  { id: "comment", name: "Comment spotlight", category: "Social", format: "square", duration: 5, description: "Feature a viewer comment with a polished social response.", palette: ["#fff4df", "#ff8a5b", "#24212c"], preview: "comment" },
  { id: "notification", name: "App notification", category: "UI", format: "vertical", duration: 4, description: "A crisp notification card for product demos and app promos.", palette: ["#171a24", "#67e8c3", "#f4f5fa"], preview: "notification" },
  { id: "product", name: "Product promotion", category: "Marketing", format: "square", duration: 5, description: "A bold launch composition with a floating product card.", palette: ["#f8f4ff", "#9f7aea", "#261b43"], preview: "product" },
  { id: "quote", name: "Animated quote", category: "Typography", format: "portrait", duration: 5, description: "Staggered quote typography with a warm editorial accent.", palette: ["#fff1e8", "#f08c72", "#4b2730"], preview: "quote" },
  { id: "logo", name: "Logo reveal", category: "Brand", format: "landscape", duration: 5, description: "A minimal brand reveal with elastic motion and breathing hold.", palette: ["#171821", "#a78bfa", "#f4f1ff"], preview: "logo" },
  { id: "announcement", name: "Social announcement", category: "Social", format: "vertical", duration: 5, description: "A clean announcement layout with mask and float motion.", palette: ["#dffbf2", "#62d4ad", "#163c31"], preview: "announcement" },
  { id: "lower-third", name: "Creator lower third", category: "Brand", format: "landscape", duration: 6, description: "Name and role reveal for intros, interviews, and tutorials.", palette: ["#11131d", "#8b5cf6", "#ffffff"], preview: "lower-third" },
  { id: "app-promo", name: "App feature showcase", category: "UI", format: "vertical", duration: 6, description: "Phone-style product framing for onboarding and feature launches.", palette: ["#eef2ff", "#5b67f1", "#11152b"], preview: "phone" },
  { id: "countdown", name: "Launch countdown", category: "Marketing", format: "square", duration: 5, description: "High-impact countdown typography for launches and live events.", palette: ["#12131b", "#ffcc66", "#f7f4ff"], preview: "countdown" },
  { id: "testimonial", name: "Customer testimonial", category: "Marketing", format: "portrait", duration: 6, description: "A premium review card with avatar and quote animation.", palette: ["#f4efff", "#7c5cff", "#2d2442"], preview: "testimonial" },
  { id: "stat-card", name: "Animated stat card", category: "Marketing", format: "square", duration: 5, description: "A clear metric reveal for reports, ads, and pitch content.", palette: ["#e8fff7", "#28b894", "#15342d"], preview: "stat" },
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
    default: return [];
  }
}

function buildChatbox(scene: Scene): Layer[] {
  const title = text(scene, "Conversation title", "A QUICK UPDATE", .1, .08, .8, .1, 42, "#17192b");
  const bubbleA = card(scene, "Message from Alex", .08, .25, .67, .17, "#ffffff", 42);
  const messageA = text(scene, "Message text", "Alex · 09:42\nThe first draft is ready ✨", .13, .285, .57, .1, 28, "#202235");
  const bubbleB = card(scene, "Reply bubble", .25, .5, .67, .16, "#7c5cff", 42);
  const messageB = text(scene, "Reply text", "Perfect. Let’s make it move.", .3, .55, .57, .08, 29, "#ffffff");
  enter(title, "fadeIn", 0, .45); enter(bubbleA, "moveIn", .15, .55, "left"); enter(messageA, "fadeIn", .32, .4);
  enter(bubbleB, "moveIn", .7, .55, "right"); enter(messageB, "fadeIn", .88, .4); loop(bubbleB, "float", 1.5, 2.2, 7);
  return [title, bubbleA, messageA, bubbleB, messageB];
}

function buildComment(scene: Scene): Layer[] {
  const cardLayer = card(scene, "Comment card", .1, .24, .8, .48, "#ffffff", 46); cardLayer.style.shadow = 34;
  const avatar = createShapeLayer(scene, "circle", { name: "Avatar", position: pos(scene, .15, .31), size: size(scene, .12, .12), fill: "#ff8a5b" });
  const user = text(scene, "Username", "@creativefriend", .3, .3, .52, .08, 30, "#24212c");
  const comment = text(scene, "Comment", "This animation made the whole post feel premium.", .15, .43, .67, .18, 43, "#24212c");
  const likes = text(scene, "Likes", "♥  1,284", .15, .65, .25, .06, 24, "#ff6b77");
  enter(cardLayer, "scaleIn", 0, .65); enter(avatar, "scaleIn", .2, .45); enter(user, "moveIn", .28, .45, "left"); enter(comment, "moveIn", .45, .58, "up"); enter(likes, "fadeIn", .85, .4); loop(avatar, "pulse", 1.3, 1.6, .05);
  return [cardLayer, avatar, user, comment, likes];
}

function buildNotification(scene: Scene): Layer[] {
  const title = text(scene, "Section title", "PRODUCT UPDATE", .1, .12, .8, .08, 34, "#67e8c3");
  const cardLayer = card(scene, "Notification", .08, .34, .84, .23, "#242734", 36); cardLayer.style.shadow = 38;
  const icon = createShapeLayer(scene, "circle", { name: "App icon", position: pos(scene, .13, .385), size: size(scene, .13, .13), fill: "#67e8c3" });
  const copy = text(scene, "Notification copy", "Kurogi Motion\nYour export is ready.", .31, .38, .54, .14, 31, "#f4f5fa");
  const time = text(scene, "Notification time", "now", .78, .36, .1, .04, 19, "#9298a8");
  enter(title, "fadeIn", 0, .4); enter(cardLayer, "moveIn", .18, .62, "down"); enter(icon, "scaleIn", .42, .45); enter(copy, "fadeIn", .5, .45); enter(time, "fadeIn", .62, .35); loop(cardLayer, "float", 1.4, 2.3, 6);
  return [title, cardLayer, icon, copy, time];
}

function buildProduct(scene: Scene): Layer[] {
  const product = card(scene, "Product card", .55, .18, .32, .58, "#9f7aea", 48); product.style.shadow = 34;
  const title = text(scene, "Launch headline", "NEW\nDROP.", .08, .18, .5, .3, 118, "#261b43");
  const subtitle = text(scene, "Subtitle", "DESIGNED TO MOVE", .09, .64, .42, .06, 25, "#6e6688");
  enter(product, "scaleIn", .18, .7); loop(product, "float", 1.1, 2.1, 14); enter(title, "moveIn", 0, .65, "up", true); enter(subtitle, "fadeIn", .48, .45);
  return [product, title, subtitle];
}

function buildQuote(scene: Scene): Layer[] {
  const quote = text(scene, "Quote", "MAKE\nEVERY IDEA\nMOVE.", .1, .16, .8, .52, 104, "#4b2730");
  const accent = createShapeLayer(scene, "circle", { name: "Accent", position: pos(scene, .68, .68), size: size(scene, .18, .14), fill: "#f08c72" });
  enter(quote, "moveIn", 0, .7, "up", true, "word"); enter(accent, "scaleIn", .3, .55); loop(accent, "pulse", 1.1, 1.4, .05);
  return [quote, accent];
}

function buildLogo(scene: Scene): Layer[] {
  const mark = card(scene, "Logo block", .43, .3, .14, .25, "#a78bfa", 44);
  const name = text(scene, "Brand name", "KUROGI MOTION", .25, .66, .5, .09, 52, "#f4f1ff"); name.style.align = "center";
  enter(mark, "rotateIn", 0, .8); loop(mark, "breathe", 1.2, 1.8, .04); enter(name, "fadeIn", .55, .55, "up", true, "character");
  return [mark, name];
}

function buildAnnouncement(scene: Scene): Layer[] {
  const title = text(scene, "Announcement", "HELLO\nWORLD.", .1, .18, .8, .32, 112, "#163c31");
  const pill = card(scene, "Announcement pill", .11, .59, .48, .09, "#62d4ad", 999);
  const label = text(scene, "Pill label", "NEW COLLECTION", .16, .61, .38, .05, 24, "#163c31");
  enter(title, "maskReveal", 0, .75, "left", true, "line"); loop(title, "float", 1.1, 2.4, 11); enter(pill, "moveIn", .45, .55, "left"); enter(label, "fadeIn", .72, .35);
  return [title, pill, label];
}

function buildLowerThird(scene: Scene): Layer[] {
  const bar = card(scene, "Lower third bar", .08, .68, .52, .18, "#8b5cf6", 24);
  const name = text(scene, "Creator name", "GILANG CREATIVE", .12, .705, .42, .06, 43, "#ffffff");
  const role = text(scene, "Creator role", "MOTION DESIGNER", .12, .78, .32, .04, 22, "#d8ccff");
  enter(bar, "moveIn", .2, .65, "left"); enter(name, "moveIn", .45, .5, "left"); enter(role, "fadeIn", .7, .35); out(bar, scene, "moveOut", .55, "left"); out(name, scene, "fadeOut", .45); out(role, scene, "fadeOut", .4);
  return [bar, name, role];
}

function buildAppPromo(scene: Scene): Layer[] {
  const title = text(scene, "Feature headline", "YOUR WORKFLOW\nJUST GOT FASTER.", .09, .1, .82, .22, 64, "#11152b");
  const phone = card(scene, "Phone frame", .24, .38, .52, .48, "#11152b", 58); phone.style.shadow = 42;
  const screen = card(scene, "Phone screen", .28, .42, .44, .39, "#5b67f1", 42);
  const pill = card(scene, "Feature pill", .36, .54, .28, .08, "#ffffff", 999);
  const label = text(scene, "Feature label", "ONE-TAP MOTION", .39, .565, .22, .04, 20, "#11152b"); label.style.align = "center";
  enter(title, "moveIn", 0, .65, "up", true, "line"); enter(phone, "scaleIn", .35, .7); enter(screen, "fadeIn", .65, .4); enter(pill, "moveIn", .85, .5, "up"); enter(label, "fadeIn", 1.05, .35); loop(phone, "float", 1.6, 2.2, 8);
  return [title, phone, screen, pill, label];
}

function buildCountdown(scene: Scene): Layer[] {
  const label = text(scene, "Countdown label", "LAUNCHING IN", .22, .18, .56, .07, 30, "#ffcc66"); label.style.align = "center";
  const number = text(scene, "Countdown number", "03", .18, .29, .64, .4, 260, "#f7f4ff"); number.style.align = "center";
  const footer = text(scene, "Countdown footer", "SAVE THE DATE", .25, .76, .5, .06, 26, "#a6a2b3"); footer.style.align = "center";
  enter(label, "fadeIn", 0, .4); enter(number, "scaleIn", .15, .72); loop(number, "pulse", 1, 1, .06); enter(footer, "moveIn", .6, .5, "up");
  return [label, number, footer];
}

function buildTestimonial(scene: Scene): Layer[] {
  const cardLayer = card(scene, "Testimonial card", .08, .16, .84, .68, "#ffffff", 52); cardLayer.style.shadow = 38;
  const avatar = createShapeLayer(scene, "circle", { name: "Customer avatar", position: pos(scene, .15, .24), size: size(scene, .14, .11), fill: "#7c5cff" });
  const name = text(scene, "Customer name", "Nadia Pratama", .34, .245, .45, .05, 27, "#2d2442");
  const role = text(scene, "Customer role", "Social Media Designer", .34, .3, .45, .04, 20, "#827895");
  const quote = text(scene, "Review quote", "“I made three polished ad variations before lunch.”", .15, .44, .7, .22, 48, "#2d2442");
  enter(cardLayer, "scaleIn", 0, .65); enter(avatar, "scaleIn", .22, .45); enter(name, "moveIn", .35, .45, "left"); enter(role, "fadeIn", .52, .35); enter(quote, "moveIn", .62, .58, "up", true, "word");
  return [cardLayer, avatar, name, role, quote];
}

function buildStatCard(scene: Scene): Layer[] {
  const cardLayer = card(scene, "Metric card", .09, .18, .82, .64, "#ffffff", 54); cardLayer.style.shadow = 32;
  const eyebrow = text(scene, "Metric label", "CAMPAIGN LIFT", .16, .29, .5, .06, 28, "#28b894");
  const metric = text(scene, "Metric", "+42%", .14, .39, .72, .23, 150, "#15342d");
  const detail = text(scene, "Metric detail", "More completed views after adding motion.", .16, .68, .66, .08, 27, "#607b73");
  enter(cardLayer, "scaleIn", 0, .62); enter(eyebrow, "fadeIn", .25, .35); enter(metric, "moveIn", .38, .65, "up", true, "character"); enter(detail, "fadeIn", .85, .4); loop(metric, "breathe", 1.5, 1.8, .025);
  return [cardLayer, eyebrow, metric, detail];
}

function text(scene: Scene, name: string, value: string, x: number, y: number, width: number, height: number, fontSize: number, color: string): TextLayer {
  return createTextLayer(scene, { name, text: value, position: pos(scene, x, y), size: size(scene, width, height), fontSize, color });
}
function card(scene: Scene, name: string, x: number, y: number, width: number, height: number, fill: string, radius: number) {
  const layer = createShapeLayer(scene, "rectangle", { name, position: pos(scene, x, y), size: size(scene, width, height), fill });
  layer.style.borderRadius = radius;
  return layer;
}
function pos(scene: Scene, x: number, y: number) { return { x: scene.width * x, y: scene.height * y }; }
function size(scene: Scene, width: number, height: number) { return { width: scene.width * width, height: scene.height * height }; }

function enter(layer: Layer, type: "fadeIn" | "moveIn" | "scaleIn" | "rotateIn" | "maskReveal", startTime: number, duration: number, direction: string = "up", stagger = false, unit: "line" | "word" | "character" = "line") {
  layer.animationActions.push(createAnimationAction(layer.id, "in", type, { startTime, duration, easing: type === "scaleIn" || type === "rotateIn" ? "backOut" : "easeOut", parameters: { direction, distance: 90, scale: .55, rotation: 85 }, stagger: stagger ? { enabled: true, unit, delay: unit === "character" ? .035 : .08, order: "normal", seed: 42 } : undefined }));
}
function loop(layer: Layer, type: "float" | "pulse" | "breathe", startTime: number, duration: number, intensity: number) {
  layer.animationActions.push(createAnimationAction(layer.id, "loop", type, { startTime, duration, easing: "easeInOut", parameters: { intensity }, repeat: { count: "infinite", delay: 0 } }));
}
function out(layer: Layer, scene: Scene, type: "fadeOut" | "moveOut", duration: number, direction = "down") {
  layer.animationActions.push(createAnimationAction(layer.id, "out", type, { startTime: Math.max(0, scene.duration - duration), duration, easing: "easeIn", parameters: { direction, distance: 90 } }));
}
