import type { CreateProjectOptions } from "./project";
import {
  addLayers,
  createAnimationAction,
  createProject,
  createShapeLayer,
  createTextLayer,
  getActiveScene,
} from "./project";

export function createTemplateProject(options: CreateProjectOptions, templateId?: string) {
  let project = createProject(options);
  if (!templateId) return project;
  const scene = getActiveScene(project);

  if (templateId === "product") {
    const badge = createShapeLayer(scene, "rectangle", {
      name: "Product card",
      position: { x: scene.width * 0.52, y: scene.height * 0.18 },
      size: { width: scene.width * 0.32, height: scene.height * 0.58 },
      fill: "#8b5cf6",
    });
    badge.style.borderRadius = 48;
    badge.style.shadow = 34;
    badge.animationActions.push(
      createAnimationAction(badge.id, "in", "scaleIn", {
        duration: 0.7,
        easing: "backOut",
        parameters: { scale: 0.55 },
      }),
      createAnimationAction(badge.id, "loop", "float", {
        startTime: 0.9,
        duration: 2.1,
        parameters: { intensity: 14 },
      }),
    );
    const title = createTextLayer(scene, {
      name: "Launch headline",
      text: "NEW\nDROP.",
      position: { x: scene.width * 0.08, y: scene.height * 0.18 },
      size: { width: scene.width * 0.52, height: scene.height * 0.32 },
      fontSize: 120,
      color: "#1d1738",
    });
    title.animationActions.push(
      createAnimationAction(title.id, "in", "moveIn", {
        duration: 0.65,
        easing: "overshoot",
        parameters: { direction: "up", distance: 90 },
        stagger: { enabled: true, unit: "line", delay: 0.12, order: "normal", seed: 12 },
      }),
      createAnimationAction(title.id, "out", "fadeOut", {
        startTime: Math.max(0, scene.duration - 0.65),
        duration: 0.65,
        easing: "easeIn",
      }),
    );
    const subtitle = createTextLayer(scene, {
      name: "Launch subtitle",
      text: "DESIGNED TO MOVE",
      position: { x: scene.width * 0.09, y: scene.height * 0.62 },
      size: { width: scene.width * 0.46, height: 70 },
      fontSize: 26,
      color: "#6e6688",
    });
    subtitle.animationActions.push(
      createAnimationAction(subtitle.id, "in", "fadeIn", {
        startTime: 0.45,
        duration: 0.5,
      }),
    );
    project = addLayers(project, [badge, title, subtitle]);
  }

  if (templateId === "quote") {
    const quote = createTextLayer(scene, {
      name: "Quote",
      text: "MAKE\nEVERY IDEA\nMOVE.",
      position: { x: scene.width * 0.1, y: scene.height * 0.16 },
      size: { width: scene.width * 0.8, height: scene.height * 0.52 },
      fontSize: 105,
      color: "#4b2730",
    });
    quote.animationActions.push(
      createAnimationAction(quote.id, "in", "moveIn", {
        duration: 0.7,
        easing: "backOut",
        parameters: { direction: "up", distance: 80 },
        stagger: { enabled: true, unit: "word", delay: 0.08, order: "normal", seed: 7 },
      }),
      createAnimationAction(quote.id, "out", "blurOut", {
        startTime: Math.max(0, scene.duration - 0.7),
        duration: 0.7,
        easing: "easeIn",
      }),
    );
    const accent = createShapeLayer(scene, "circle", {
      name: "Accent",
      position: { x: scene.width * 0.68, y: scene.height * 0.67 },
      size: { width: 170, height: 170 },
      fill: "#f08c72",
    });
    accent.animationActions.push(
      createAnimationAction(accent.id, "in", "scaleIn", { startTime: 0.3, duration: 0.55, easing: "elastic" }),
      createAnimationAction(accent.id, "loop", "pulse", { startTime: 1.1, duration: 1.4 }),
    );
    project = addLayers(project, [quote, accent]);
  }

  if (templateId === "logo") {
    const logo = createShapeLayer(scene, "rectangle", {
      name: "Logo block",
      position: { x: scene.width * 0.43, y: scene.height * 0.33 },
      size: { width: scene.width * 0.14, height: scene.height * 0.25 },
      fill: "#a78bfa",
    });
    logo.style.borderRadius = 44;
    logo.animationActions.push(
      createAnimationAction(logo.id, "in", "rotateIn", {
        duration: 0.8,
        easing: "elastic",
        parameters: { rotation: 90 },
      }),
      createAnimationAction(logo.id, "loop", "breathe", {
        startTime: 1.2,
        duration: 1.8,
      }),
      createAnimationAction(logo.id, "out", "scaleOut", {
        startTime: Math.max(0, scene.duration - 0.6),
        duration: 0.6,
      }),
    );
    const name = createTextLayer(scene, {
      name: "Brand name",
      text: "KUROGI MOTION",
      position: { x: scene.width * 0.32, y: scene.height * 0.66 },
      size: { width: scene.width * 0.36, height: 90 },
      fontSize: 54,
      color: "#f4f1ff",
    });
    name.style.align = "center";
    name.animationActions.push(
      createAnimationAction(name.id, "in", "fadeIn", {
        startTime: 0.55,
        duration: 0.55,
        stagger: { enabled: true, unit: "character", delay: 0.035, order: "center", seed: 3 },
      }),
    );
    project.scenes[scene.id].background = { type: "solid", color: "#171821" };
    project = addLayers(project, [logo, name]);
  }

  if (templateId === "announcement") {
    const title = createTextLayer(scene, {
      name: "Announcement",
      text: "HELLO\nWORLD.",
      position: { x: scene.width * 0.1, y: scene.height * 0.18 },
      size: { width: scene.width * 0.8, height: scene.height * 0.32 },
      fontSize: 112,
      color: "#163c31",
    });
    title.animationActions.push(
      createAnimationAction(title.id, "in", "maskReveal", {
        duration: 0.75,
        easing: "easeOut",
        parameters: { direction: "left" },
        stagger: { enabled: true, unit: "line", delay: 0.12, order: "normal", seed: 2 },
      }),
      createAnimationAction(title.id, "loop", "float", {
        startTime: 1.1,
        duration: 2.4,
        parameters: { intensity: 11 },
      }),
    );
    const pill = createShapeLayer(scene, "rectangle", {
      name: "Announcement pill",
      position: { x: scene.width * 0.11, y: scene.height * 0.59 },
      size: { width: scene.width * 0.48, height: 110 },
      fill: "#62d4ad",
    });
    pill.style.borderRadius = 999;
    pill.animationActions.push(
      createAnimationAction(pill.id, "in", "moveIn", {
        startTime: 0.45,
        duration: 0.55,
        easing: "backOut",
        parameters: { direction: "left", distance: 120 },
      }),
    );
    project = addLayers(project, [title, pill]);
  }

  return project;
}
