import "./Loading.css";

export default function Loading({ text = "Loading..." }) {
  return (
    <div class="loading-overlay">
      <div class="loading-container">
        <div class="loading-wave">
          {text.split('').map((char, index) => (
            <span key={index} style={char === ' ' ? { width: '8px' } : {}}>
              {char}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
