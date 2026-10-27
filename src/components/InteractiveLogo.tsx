"use client";

import React, { useRef, useState } from "react";

interface InteractiveLogoProps {
  text?: string;
  className?: string;
  variant?: "header" | "footer-small" | "footer-giant";
}

/**
 * InteractiveLogo — firma de Teo Labs.
 *
 * Cada letra reacciona a la posición del mouse con movimiento y efectos
 * visuales. Es un componente compartido entre los sitios de Teo Labs: conviene
 * mantenerlo igual en todos, así que se copia tal cual y no se le hacen
 * arreglos locales.
 *
 * Variantes:
 * - 'header': gradiente y movimiento sutil (navegación).
 * - 'footer-small': versión chica con gradiente (créditos y legales).
 * - 'footer-giant': texto gigante con aberración cromática (secciones de impacto).
 */
export default function InteractiveLogo({
  text = "Teo Labs",
  className = "",
  variant = "header",
}: InteractiveLogoProps) {
  return (
    <span className={`flex select-none ${className}`}>
      {/* El texto plano es lo que leen los lectores de pantalla y los
          buscadores: las letras animadas van una por `span` y sueltas se
          deletrearían. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="flex">
        {text.split("").map((char, index) => (
          <AnimatedLetter key={index} char={char} index={index} variant={variant} />
        ))}
      </span>
    </span>
  );
}

function AnimatedLetter({
  char,
  index,
  variant,
}: {
  char: string;
  index: number;
  variant: "header" | "footer-small" | "footer-giant";
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [mouseX, setMouseX] = useState(0);
  const letterRef = useRef<HTMLSpanElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (letterRef.current) {
      const rect = letterRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      setMouseX(x);
    }
  };

  if (char === " ") {
    return (
      <span
        className={`inline-block ${variant === "footer-giant" ? "w-[0.3em]" : "w-[0.2em]"}`}
      />
    );
  }

  const getStyle = (): React.CSSProperties => {
    // Lógica de transformación basada en la variante
    const intensity = variant === "footer-giant" ? 8 : 4;
    const skew = variant === "footer-giant" ? 15 : 10;
    const transform = isHovered
      ? `translateY(${Math.sin(index * 0.5 + mouseX * 3) * intensity}px) skewX(${mouseX * skew}deg)`
      : "translateY(0) skewX(0)";

    const style: React.CSSProperties = {
      transform,
      transition: isHovered ? "transform 0.1s ease-out" : "transform 0.3s ease-out",
      fontWeight: isHovered || variant === "footer-giant" ? "700" : "600",
    };

    // Lógica de sombra (aberración cromática solo para la versión gigante)
    if (variant === "footer-giant") {
      if (isHovered) {
        style.textShadow = `${-4 - mouseX * 10}px 0 0 rgba(255, 0, 0, 0.6), ${4 - mouseX * 10}px 0 0 rgba(0, 255, 255, 0.6)`;
      } else {
        style.textShadow =
          "-3px 0 0 rgba(255, 0, 0, 0.5), 3px 0 0 rgba(0, 255, 255, 0.5)";
      }
    }

    return style;
  };

  const getClassName = () => {
    if (variant === "footer-giant") {
      return "inline-block relative cursor-default";
    }
    // Clases para el gradiente de Teo Labs
    return "inline-block relative cursor-default bg-gradient-to-r from-blue-600 via-purple-500 to-green-500 bg-clip-text text-transparent";
  };

  return (
    <span
      ref={letterRef}
      className={getClassName()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setMouseX(0);
      }}
      onMouseMove={handleMouseMove}
      style={getStyle()}
    >
      {char}
    </span>
  );
}
