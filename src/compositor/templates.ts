import type { ContentCategory, ContentFormat } from '../content/types/content';

export type FocalPoint = 'center' | 'top' | 'bottom';

export interface TemplateProps {
  imageUrl: string;
  title: string;
  category: ContentCategory;
  format: ContentFormat;
  width: number;
  height: number;
  focalPoint?: FocalPoint;
}

// React.createElement style without needing React
function h(type: string, props: any, ...children: any[]) {
  return {
    type,
    props: {
      ...props,
      children: children.length === 1 ? children[0] : children,
    },
  };
}

export function buildTemplate({ imageUrl, title, category, format, width, height, focalPoint = 'center' }: TemplateProps) {
  const categoryColors: Record<ContentCategory, string> = {
    anime: '#FF5C5C', // Red
    manga: '#5C8CFF', // Blue
    game: '#5CFF8C',  // Green
    novel: '#FFD15C'  // Yellow
  };

  const color = categoryColors[category] || '#ffffff';
  
  // Create a 3-layer template
  // Layer 1: Background image
  // Layer 2: Gradient overlay
  // Layer 3: Text content
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        width: `${width}px`,
        height: `${height}px`,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: focalPoint,
        fontFamily: 'Inter',
      },
    },
    // Gradient Overlay
    h(
      'div',
      {
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.1) 100%)',
        },
      }
    ),
    // Content Container
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          padding: '40px',
          color: '#ffffff',
        },
      },
      // Category Badge
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            marginBottom: '16px',
          },
        },
        h('div', {
          style: {
            backgroundColor: color,
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '24px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '2px',
          },
        }, category),
        h('div', {
          style: {
            marginLeft: '16px',
            fontSize: '24px',
            color: '#aaaaaa',
          },
        }, format.replace('-', ' ').toUpperCase())
      ),
      // Title
      h(
        'div',
        {
          style: {
            fontSize: title.length > 50 ? '48px' : '64px',
            fontWeight: 700,
            lineHeight: 1.2,
            textShadow: '0 4px 8px rgba(0,0,0,0.5)',
          },
        },
        title
      )
    )
  );
}
