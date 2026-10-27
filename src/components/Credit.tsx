import InteractiveLogo from "./InteractiveLogo";

export default function Credit() {
  return (
    <p className="credit">
      <span>Desarrollado por</span>
      <a href="https://www.teolabs.app" target="_blank" rel="noopener noreferrer">
        <InteractiveLogo variant="footer-small" className="text-[14px]" />
      </a>
      <span aria-hidden="true">®</span>
    </p>
  );
}
