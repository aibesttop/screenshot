/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f8fa",
          100: "#eceef3",
          200: "#d5d9e3",
          300: "#a9b0c2",
          400: "#7a8299",
          500: "#525a73",
          600: "#3a4159",
          700: "#252b40",
          800: "#161a2b",
          900: "#0b0d18",
          950: "#05060e",
        },
        brand: {
          DEFAULT: "#5b8cff",
          600: "#3d6ef0",
          700: "#2955d1",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      typography: ({ theme }) => ({
        invert: {
          css: {
            "--tw-prose-body": theme("colors.ink.200"),
            "--tw-prose-headings": theme("colors.white"),
            "--tw-prose-links": theme("colors.brand.DEFAULT"),
            "--tw-prose-bold": theme("colors.white"),
            "--tw-prose-code": theme("colors.ink.100"),
            "--tw-prose-quotes": theme("colors.ink.300"),
            "--tw-prose-hr": theme("colors.ink.700"),
          },
        },
      }),
    },
  },
  plugins: [],
};
