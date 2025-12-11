
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- Types & Interfaces ---
type WasteCategory = 'ACEITES' | 'GRASAS' | 'VIDRIO' | 'ORGANICOS' | 'PLASTICO' | 'PAPEL_CARTON';
type EntityRole = 'GENERADOR' | 'GESTOR' | 'AUTORIDAD' | 'ADMIN';

interface Entity {
  id: string;
  name: string;
  role: EntityRole;
  address: string;
  wasteTypes: WasteCategory[];
  quantityDescription: string;
  availableQuantity: number; // Numeric for calculation
  unit: 'kg' | 'L' | 'unidades';
  pricePerUnit: number; // COP (Absolute value)
  currency: 'COP';
  lastUpdate: string;
  lat: number;
  lng: number;
  verified: boolean;
  traceabilityHash: string; // Web3 simulation
}

// --- Constants & Mock Data (Cartagena) ---

const CARTAGENA_CENTER: [number, number] = [10.4217, -75.5477];

// Helper for random hash
const genHash = () => '0x' + Math.random().toString(16).substr(2, 8) + '...' + Math.random().toString(16).substr(2, 4);

// CO2 Factors (kg CO2e avoided per unit processed)
// Source estimates: EPA WARM Model / LCA databases approx.
const CO2_FACTORS: Record<WasteCategory, number> = {
  ACEITES: 2.8,       // High impact: Fossil fuel substitution (Biodiesel)
  GRASAS: 1.2,        // Medium: Biogas generation
  VIDRIO: 0.3,        // Low per unit: Energy saving in melting
  ORGANICOS: 0.5,     // Medium: Avoided landfill methane
  PLASTICO: 1.5,      // High: Avoided virgin plastic production
  PAPEL_CARTON: 1.0   // Medium: Avoided deforestation/processing
};

// Truck Emission Factor (kg CO2 per km)
// Approx for a light duty diesel truck
const TRUCK_EMISSION_PER_KM = 0.25;

// Logic: Market Rules
const getEconomicModel = (category: WasteCategory) => {
    switch (category) {
        case 'GRASAS':
            return { type: 'COSTO', label: 'Servicio de Recolección', color: '#F59E0B', sign: '-' }; // Generator Pays
        case 'ORGANICOS':
            return { type: 'GRATIS', label: 'Recolección Gratuita', color: '#3B82F6', sign: '' }; // Free
        default:
            return { type: 'INGRESO', label: 'Venta de Material', color: '#10B981', sign: '+' }; // Generator Earns
    }
};

const ENTITIES_DATA: Entity[] = [
  { 
    id: '1', name: 'Restaurante El Baluarte', role: 'GENERADOR', address: 'Centro Histórico, Calle 32', 
    wasteTypes: ['ACEITES'], quantityDescription: '50L Aceite Usado', availableQuantity: 50, unit: 'L', pricePerUnit: 1500, currency: 'COP',
    lastUpdate: '2h', lat: 10.4230, lng: -75.5490, verified: true, traceabilityHash: genHash()
  },
  { 
    id: '2', name: 'Hotel Caribe Plaza', role: 'GENERADOR', address: 'Bocagrande, Av. San Martín', 
    wasteTypes: ['PLASTICO', 'PAPEL_CARTON'], quantityDescription: '100kg Reciclables', availableQuantity: 100, unit: 'kg', pricePerUnit: 800, currency: 'COP',
    lastUpdate: '5h', lat: 10.4080, lng: -75.5550, verified: true, traceabilityHash: genHash()
  },
  { 
    id: '3', name: 'Recuperadora del Caribe SAS', role: 'GESTOR', address: 'Zona Industrial Mamonal', 
    wasteTypes: ['ACEITES', 'GRASAS'], quantityDescription: 'Planta de Procesamiento', availableQuantity: 0, unit: 'L', pricePerUnit: 0, currency: 'COP',
    lastUpdate: '1d', lat: 10.3850, lng: -75.5000, verified: true, traceabilityHash: genHash()
  },
  { 
    id: '4', name: 'Café del Mar', role: 'GENERADOR', address: 'Baluarte Santo Domingo', 
    wasteTypes: ['VIDRIO'], quantityDescription: '45 botellas', availableQuantity: 45, unit: 'unidades', pricePerUnit: 200, currency: 'COP',
    lastUpdate: '30m', lat: 10.4245, lng: -75.5520, verified: true, traceabilityHash: genHash()
  },
  { 
    id: '5', name: 'EPA Cartagena (Autoridad)', role: 'AUTORIDAD', address: 'Pie de la Popa', 
    wasteTypes: [], quantityDescription: 'Supervisión', availableQuantity: 0, unit: 'kg', pricePerUnit: 0, currency: 'COP',
    lastUpdate: 'En línea', lat: 10.4180, lng: -75.5350, verified: true, traceabilityHash: genHash()
  },
   { 
    id: '7', name: 'Fritos & Más', role: 'GENERADOR', address: 'Av. Pedro de Heredia', 
    wasteTypes: ['GRASAS'], quantityDescription: 'Trampa de Grasa (20L)', availableQuantity: 20, unit: 'L', pricePerUnit: 5000, currency: 'COP',
    lastUpdate: '4h', lat: 10.4050, lng: -75.5250, verified: false, traceabilityHash: genHash()
  },
  { 
    id: '8', name: 'Mercado Bazurto Co.', role: 'GENERADOR', address: 'Av. del Lago', 
    wasteTypes: ['ORGANICOS'], quantityDescription: '500kg Orgánicos', availableQuantity: 500, unit: 'kg', pricePerUnit: 0, currency: 'COP',
    lastUpdate: '10m', lat: 10.4130, lng: -75.5300, verified: false, traceabilityHash: genHash()
  }
];

// --- Utilities (Distance Calculation) ---
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180);
}

// --- Styles ---

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: '#1a1a1a',
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  header: {
    height: '60px',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(255, 255, 255, 0.95)',
    borderBottom: '1px solid #e5e5e5',
    zIndex: 1000,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  logo: {
    fontWeight: 800,
    fontSize: '20px',
    letterSpacing: '-0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#064E3B',
  },
  roleSwitcher: {
    display: 'flex',
    background: '#f3f4f6',
    padding: '4px',
    borderRadius: '8px',
    gap: '4px',
  },
  roleBtn: (active: boolean) => ({
    border: 'none',
    background: active ? '#fff' : 'transparent',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: active ? '#10B981' : '#666',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
  }),
  main: {
    flex: 1,
    position: 'relative' as const,
    display: 'flex',
  },
  mapContainer: {
    flex: 1,
    height: '100%',
    width: '100%',
    background: '#e0e0e0',
    zIndex: 0,
  },
  sidebar: {
    width: '420px',
    height: 'calc(100% - 24px)',
    position: 'absolute' as const,
    top: '12px',
    left: '12px',
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.8)',
    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)',
    zIndex: 500,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    border: '1px solid #f0f0f0',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative' as const,
  },
  cardSelected: {
    borderColor: '#10B981',
    background: '#F0FDF4',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.1)',
  },
  badge: (color: string, bg: string) => ({
    fontSize: '10px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '100px',
    background: bg,
    color: color,
    textTransform: 'uppercase' as const,
  }),
  priceTag: (color: string, bg: string) => ({
    fontFamily: '"Roboto Mono", monospace',
    fontSize: '12px',
    fontWeight: 600,
    color: color,
    background: bg,
    padding: '4px 8px',
    borderRadius: '6px',
    marginTop: '8px',
    display: 'inline-block',
  }),
  esgTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#15803D',
    background: '#DCFCE7',
    padding: '4px 8px',
    borderRadius: '100px',
    fontWeight: 600,
    marginLeft: '8px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#374151',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  calculatorPanel: {
    background: '#F9FAFB',
    borderRadius: '12px',
    padding: '16px',
    marginTop: '16px',
    border: '1px solid #E5E7EB',
  },
  calcRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '13px',
    color: '#4B5563',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px dashed #D1D5DB',
    fontWeight: 700,
    fontSize: '15px',
    color: '#111827',
  },
  actionBtn: (primary: boolean, color: string = '#10B981') => ({
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: primary ? color : '#E5E7EB',
    color: primary ? '#fff' : '#374151',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '12px',
    fontSize: '13px',
  }),
  traceHash: {
    fontFamily: '"Courier New", monospace',
    fontSize: '10px',
    color: '#9CA3AF',
    wordBreak: 'break-all' as const,
    marginTop: '8px',
    display: 'block',
  }
};

const WASTE_LABELS: Record<WasteCategory, string> = {
  ACEITES: '🛢️ Aceites',
  GRASAS: '🥓 Grasas',
  VIDRIO: '🍾 Vidrio',
  ORGANICOS: '🍎 Orgánicos',
  PLASTICO: '🥤 Plástico',
  PAPEL_CARTON: '📦 Cartón',
};

// --- Main App Component ---

const App = () => {
  // State
  const [currentUserRole, setCurrentUserRole] = useState<EntityRole>('GESTOR');
  const [selectedCategory, setSelectedCategory] = useState<WasteCategory | 'TODOS'>('TODOS');
  
  // Selection State
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [routeEntities, setRouteEntities] = useState<string[]>([]); // For Route Calculator

  // Producer Tag State
  const [producerMode, setProducerMode] = useState<'MANUAL' | 'NA'>('MANUAL');
  const [producerName, setProducerName] = useState<string>('');

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routePolylineRef = useRef<any>(null);

  // --- Logic: Data Filtering ---
  const filteredEntities = useMemo(() => {
    return ENTITIES_DATA.filter(entity => {
      // Filter logic: Admins/Authorities see all. Generators see recyclers. Recyclers see generators.
      // Keeping it simple for demo: Filter mainly by Category
      if (selectedCategory === 'TODOS') return true;
      return entity.wasteTypes.includes(selectedCategory);
    });
  }, [selectedCategory]);

  // --- Logic: Route Calculation ---
  const routeMetrics = useMemo(() => {
    if (routeEntities.length < 2) return { distance: 0, cost: 0, savings: 0, goodsBalance: 0, totalCO2: 0, netESG: 0 };
    
    let totalDist = 0;
    const selectedObjs = routeEntities.map(id => ENTITIES_DATA.find(e => e.id === id)).filter(Boolean) as Entity[];
    
    for (let i = 0; i < selectedObjs.length - 1; i++) {
      totalDist += getDistanceFromLatLonInKm(
        selectedObjs[i].lat, selectedObjs[i].lng,
        selectedObjs[i+1].lat, selectedObjs[i+1].lng
      );
    }
    
    // Financials
    const baseLogisticsCost = totalDist * 2500; 
    let goodsCost = 0;
    
    // ESG Calculation
    let avoidedCO2 = 0;

    selectedObjs.forEach(e => {
        const econ = getEconomicModel(e.wasteTypes[0]);
        // Financial
        if (econ.type === 'INGRESO') goodsCost += (e.availableQuantity * e.pricePerUnit);
        if (econ.type === 'COSTO') goodsCost -= (e.availableQuantity * e.pricePerUnit);
        
        // ESG: Sum CO2 avoided by recycling/processing this waste
        avoidedCO2 += (e.availableQuantity * CO2_FACTORS[e.wasteTypes[0]]);
    });

    // Truck Emissions
    const logisticsEmissions = totalDist * TRUCK_EMISSION_PER_KM;

    const discount = routeEntities.length > 2 ? 0.10 : 0; 
    
    return {
      distance: totalDist.toFixed(2),
      cost: (baseLogisticsCost * (1 - discount)).toFixed(0),
      goodsBalance: goodsCost,
      totalCO2: avoidedCO2.toFixed(1),
      netESG: (avoidedCO2 - logisticsEmissions).toFixed(1)
    };
  }, [routeEntities]);


  // --- Map Initialization ---
  useEffect(() => {
    // @ts-ignore
    if (window.L && !mapInstanceRef.current && mapContainerRef.current) {
        // @ts-ignore
        const map = window.L.map(mapContainerRef.current, { zoomControl: false }).setView(CARTAGENA_CENTER, 13);
        // @ts-ignore
        window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
        mapInstanceRef.current = map;
        renderMarkers();
    } else if (!document.getElementById('leaflet-script')) {
        // Load script logic (omitted for brevity as it's in previous version, assuming loaded or handled)
        const script = document.createElement('script');
        script.id = 'leaflet-script';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => {
             // @ts-ignore
            const map = window.L.map(mapContainerRef.current, { zoomControl: false }).setView(CARTAGENA_CENTER, 13);
            // @ts-ignore
            window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
            mapInstanceRef.current = map;
            renderMarkers();
        };
        document.head.appendChild(script);
        const link = document.createElement('link');
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }
  }, []);

  // --- Map Updates ---
  useEffect(() => {
    if (mapInstanceRef.current) {
      renderMarkers();
      drawRoute();
    }
  }, [filteredEntities, selectedEntityId, routeEntities, currentUserRole]);

  const renderMarkers = () => {
    // @ts-ignore
    const L = window.L;
    const map = mapInstanceRef.current;
    
    // Clear old
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current.clear();

    filteredEntities.forEach(entity => {
      // Logic: If I am an Authority, highlight UNVERIFIED. If I am a Manager, highlight GENERATORS.
      let isDimmed = false;
      if (currentUserRole === 'AUTORIDAD' && entity.verified) isDimmed = true;
      if (currentUserRole === 'GESTOR' && entity.role !== 'GENERADOR') isDimmed = true;

      const isSelected = selectedEntityId === entity.id || routeEntities.includes(entity.id);
      
      const markerHtml = `
        <div style="
          background: ${isSelected ? '#10B981' : (isDimmed ? '#eee' : '#fff')};
          color: ${isSelected ? '#fff' : (isDimmed ? '#aaa' : '#333')};
          width: 30px; height: 30px;
          border-radius: 50%;
          border: 2px solid ${entity.verified ? '#10B981' : '#F59E0B'};
          display: flex; justify-content: center; align-items: center;
          font-weight: bold; font-size: 14px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          opacity: ${isDimmed && !isSelected ? 0.6 : 1};
        ">
          ${entity.role === 'GENERADOR' ? (entity.wasteTypes[0] === 'ACEITES' ? '🛢️' : '📦') : (entity.role === 'AUTORIDAD' ? '⚖️' : '🚛')}
        </div>
      `;

      const icon = L.divIcon({ className: 'custom-pin', html: markerHtml, iconSize: [30, 30] });
      const marker = L.marker([entity.lat, entity.lng], { icon }).addTo(map);
      
      marker.on('click', () => handleEntityClick(entity));
      markersRef.current.set(entity.id, marker);
    });
  };

  const drawRoute = () => {
    // @ts-ignore
    const L = window.L;
    const map = mapInstanceRef.current;

    if (routePolylineRef.current) map.removeLayer(routePolylineRef.current);

    if (routeEntities.length > 1) {
        const points = routeEntities.map(id => {
            const e = ENTITIES_DATA.find(ent => ent.id === id);
            return e ? [e.lat, e.lng] : null;
        }).filter(Boolean);

        routePolylineRef.current = L.polyline(points, {
            color: '#10B981',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(map);
        
        map.fitBounds(routePolylineRef.current.getBounds(), { padding: [50, 50] });
    }
  };

  // --- Interaction Handlers ---

  const handleEntityClick = (entity: Entity) => {
    setSelectedEntityId(entity.id);
    
    // If inside Route Mode (Gestor role)
    if (currentUserRole === 'GESTOR' && entity.role === 'GENERADOR') {
       // Logic handled in UI buttons to add to route, but we could auto-add here.
       // keeping selection separate for now.
    }
  };

  const toggleRoutePoint = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (routeEntities.includes(id)) {
        setRouteEntities(prev => prev.filter(x => x !== id));
    } else {
        setRouteEntities(prev => [...prev, id]);
    }
  };

  const verifyEntity = (id: string) => {
    alert(`Generando certificado en blockchain y validando entidad ${id}... ✅`);
    // In real app, update state locally
  };

  // --- Render Components ---

  const renderCalculator = (entity: Entity) => {
      // Economic Logic Check
      const econ = getEconomicModel(entity.wasteTypes[0]);
      const total = entity.availableQuantity * entity.pricePerUnit;
      
      // ESG Calc
      const co2 = (entity.availableQuantity * CO2_FACTORS[entity.wasteTypes[0]]).toFixed(1);

      return (
          <div style={styles.calculatorPanel}>
              <div style={styles.sectionTitle}>
                  {econ.type === 'COSTO' ? '⚠️ Calculadora de Servicio' : '💰 Calculadora de Venta'}
              </div>
              <div style={styles.calcRow}>
                  <span>Cantidad Disp.:</span>
                  <b>{entity.availableQuantity} {entity.unit}</b>
              </div>
              <div style={styles.calcRow}>
                  <span>{econ.label}:</span>
                  <span>{econ.type === 'GRATIS' ? 'GRATIS' : `$${entity.pricePerUnit} COP / ${entity.unit}`}</span>
              </div>
              
              {/* ESG Row in Calculator */}
              <div style={{...styles.calcRow, background: '#F0FDF4', padding: '4px', borderRadius: '4px'}}>
                  <span style={{color: '#15803D', fontWeight: 600}}>🌱 Huella Carbono Evitada:</span>
                  <b style={{color: '#15803D'}}>{co2} kg CO₂e</b>
              </div>

              <div style={styles.totalRow}>
                  <span>
                      {econ.type === 'COSTO' ? 'Total a Pagar (Servicio):' : 
                       econ.type === 'INGRESO' ? 'Total a Recibir (Venta):' : 'Costo Total:'}
                  </span>
                  <span style={{color: econ.color}}>
                      {econ.type === 'GRATIS' ? '$0 COP' : `$${total.toLocaleString()} COP`}
                  </span>
              </div>
              <button style={styles.actionBtn(true, econ.color)}>
                  {econ.type === 'COSTO' ? 'Solicitar Recolección' : 
                   econ.type === 'INGRESO' ? 'Ofrecer Residuo' : 'Agendar Retiro'}
              </button>
          </div>
      );
  };

  const renderRouteOptimizer = () => {
      return (
          <div style={{...styles.calculatorPanel, background: '#ECFDF5', borderColor: '#10B981'}}>
             <div style={styles.sectionTitle}>🚚 Optimizador de Ruta (ESG)</div>
             <div style={{fontSize: '12px', marginBottom: '8px', color: '#065F46'}}>
                 {routeEntities.length} puntos seleccionados
             </div>
             
             <div style={styles.calcRow}>
                 <span>Distancia Total:</span>
                 <b>{routeMetrics.distance} km</b>
             </div>
             <div style={styles.calcRow}>
                 <span>Logística (Est):</span>
                 <b>-${Number(routeMetrics.cost).toLocaleString()}</b>
             </div>
             
             {/* Balance de Compra/Venta */}
             <div style={styles.calcRow}>
                 <span>Balance Materiales:</span>
                 <b style={{color: routeMetrics.goodsBalance >= 0 ? '#EF4444' : '#10B981'}}>
                     {routeMetrics.goodsBalance > 0 ? `-${routeMetrics.goodsBalance.toLocaleString()} (Compra)` : `+${Math.abs(routeMetrics.goodsBalance).toLocaleString()} (Servicios)`}
                 </b>
             </div>
             
             {/* Sección ESG en Optimizador */}
             <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #A7F3D0'}}>
                <div style={styles.calcRow}>
                    <span style={{color: '#059669'}}>Residuos Valorizados:</span>
                    <b style={{color: '#059669'}}>+{routeMetrics.totalCO2} kg CO₂e</b>
                </div>
                <div style={{...styles.calcRow, fontSize: '14px', marginTop: '4px'}}>
                    <span style={{fontWeight: 700, color: '#064E3B'}}>Impacto Neto Ruta:</span>
                    <b style={{color: '#059669'}}>🌿 -{routeMetrics.netESG} kg CO₂</b>
                </div>
                <div style={{fontSize: '10px', color: '#6EE7B7', textAlign: 'right'}}>
                    (Incluye huella logística del camión)
                </div>
             </div>

             <button 
                style={styles.actionBtn(true)} 
                onClick={() => alert("Ruta optimizada enviada. Tokens ESG acuñados provisionalmente.")}
             >
                 Iniciar Recolección Verde
             </button>
             <button 
                style={{...styles.actionBtn(false), background: 'transparent', border: '1px solid #ccc'}}
                onClick={() => setRouteEntities([])}
             >
                 Limpiar Ruta
             </button>
          </div>
      );
  };

  return (
    <div style={styles.container}>
      {/* --- HEADER --- */}
      <header style={styles.header}>
        <div style={styles.logo}>
            <span style={{fontSize: '24px'}}>♻️</span>
            <div>
                <div>RUTA-G</div>
                <div style={{fontSize: '10px', fontWeight: 400, opacity: 0.7}}>Cartagena Protocol</div>
            </div>
        </div>
        
        {/* Role Switcher for Demo */}
        <div style={styles.roleSwitcher}>
            <button style={styles.roleBtn(currentUserRole === 'GENERADOR')} onClick={() => setCurrentUserRole('GENERADOR')}>Soy Generador</button>
            <button style={styles.roleBtn(currentUserRole === 'GESTOR')} onClick={() => setCurrentUserRole('GESTOR')}>Soy Gestor</button>
            <button style={styles.roleBtn(currentUserRole === 'AUTORIDAD')} onClick={() => setCurrentUserRole('AUTORIDAD')}>Autoridad</button>
        </div>
      </header>

      {/* --- MAIN --- */}
      <main style={styles.main}>
        <div id="map" ref={mapContainerRef} style={styles.mapContainer}></div>

        {/* --- SIDEBAR --- */}
        <aside style={styles.sidebar}>
            {/* Context Header */}
            <div style={{padding: '20px 20px 10px'}}>
                <h2 style={{margin: '0 0 4px', fontSize: '18px', fontWeight: 700}}>
                    {currentUserRole === 'GESTOR' ? 'Planificador de Recolección' : 
                     currentUserRole === 'AUTORIDAD' ? 'Panel de Control Ambiental' : 
                     'Mi Inventario de Residuos'}
                </h2>
                <p style={{margin: 0, fontSize: '12px', color: '#666'}}>
                    {currentUserRole === 'GESTOR' ? 'Selecciona generadores para optimizar tu ruta.' :
                     currentUserRole === 'AUTORIDAD' ? 'Valida el cumplimiento normativo.' :
                     'Gestiona tus precios y certificados ESG.'}
                </p>
            </div>

            {/* Filter Categories (Hidden for Authority to see all) */}
            {currentUserRole !== 'AUTORIDAD' && (
                <div style={{padding: '0 20px 10px', display: 'flex', gap: '8px', overflowX: 'auto'}}>
                    {Object.entries(WASTE_LABELS).map(([k, v]) => (
                        <button 
                            key={k}
                            onClick={() => setSelectedCategory(k as WasteCategory)}
                            style={{
                                border: selectedCategory === k ? '1px solid #10B981' : '1px solid #eee',
                                background: selectedCategory === k ? '#10B981' : '#fff',
                                color: selectedCategory === k ? '#fff' : '#555',
                                borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                            }}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            )}

            {/* Entity List */}
            <div style={styles.scrollArea}>
                
                {/* Route Calculator Area (Sticky Top inside scroll if items selected) */}
                {currentUserRole === 'GESTOR' && routeEntities.length > 0 && renderRouteOptimizer()}

                {filteredEntities.map(entity => {
                    const isSelected = selectedEntityId === entity.id;
                    const inRoute = routeEntities.includes(entity.id);
                    const econ = getEconomicModel(entity.wasteTypes[0]);
                    const co2Impact = (entity.availableQuantity * CO2_FACTORS[entity.wasteTypes[0]]).toFixed(1);
                    
                    return (
                        <div 
                            key={entity.id}
                            onClick={() => handleEntityClick(entity)}
                            style={{
                                ...styles.card,
                                ...(isSelected || inRoute ? styles.cardSelected : {})
                            }}
                        >
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                <div>
                                    <h3 style={{margin: 0, fontSize: '14px', fontWeight: 700}}>
                                        {entity.name}
                                    </h3>
                                    <div style={{fontSize: '11px', color: '#666', marginTop: '2px'}}>
                                        {entity.address}
                                    </div>
                                    
                                    {/* Web3 Traceability Badge & ESG */}
                                    <div style={{marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center'}}>
                                        {entity.wasteTypes.map(t => (
                                            <span key={t} style={styles.badge('#4B5563', '#F3F4F6')}>{t}</span>
                                        ))}
                                        {/* ESG BADGE */}
                                        <span style={styles.esgTag}>
                                            🌱 -{co2Impact} kg CO₂
                                        </span>
                                    </div>
                                </div>
                                
                                <div style={{textAlign: 'right'}}>
                                    {entity.verified ? 
                                        <span style={styles.badge('#059669', '#ECFDF5')}>✓ Verificado</span> : 
                                        <span style={styles.badge('#D97706', '#FFFBEB')}>⚠ Pendiente</span>
                                    }
                                </div>
                            </div>

                            {/* Role Specific Actions inside Card */}
                            
                            {/* 1. GESTOR ACTIONS */}
                            {currentUserRole === 'GESTOR' && entity.role === 'GENERADOR' && (
                                <div style={{marginTop: '12px', borderTop: '1px solid #f0f0f0', paddingTop: '8px'}}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                        <span style={styles.priceTag(econ.color, econ.type === 'COSTO' ? '#FEF3C7' : '#ECFDF5')}>
                                            {econ.sign} ${entity.pricePerUnit} {entity.currency}/{entity.unit}
                                        </span>
                                        <button 
                                            onClick={(e) => toggleRoutePoint(entity.id, e)}
                                            style={{
                                                background: inRoute ? '#EF4444' : '#10B981',
                                                color: 'white', border: 'none', borderRadius: '4px',
                                                padding: '4px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                                            }}
                                        >
                                            {inRoute ? '- Quitar de Ruta' : '+ Añadir a Ruta'}
                                        </button>
                                    </div>
                                    {/* Detail View when selected */}
                                    {isSelected && renderCalculator(entity)}
                                </div>
                            )}

                            {/* 2. AUTORIDAD ACTIONS */}
                            {currentUserRole === 'AUTORIDAD' && isSelected && (
                                <div style={{marginTop: '12px', background: '#F9FAFB', padding: '10px', borderRadius: '8px'}}>
                                    <div style={styles.sectionTitle}>Auditoría Ambiental & ESG</div>
                                    <div style={{fontSize: '11px', marginBottom: '8px'}}>
                                        Hash Contrato: <span style={styles.traceHash}>{entity.traceabilityHash}</span>
                                    </div>
                                    <div style={{marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: '#064E3B'}}>
                                        Impacto Acumulado: -{co2Impact} kg CO₂e
                                    </div>
                                    {!entity.verified && (
                                        <button onClick={() => verifyEntity(entity.id)} style={styles.actionBtn(true)}>
                                            Validar y Emitir Sello
                                        </button>
                                    )}
                                    <button style={{...styles.actionBtn(false), marginTop: '8px'}}>
                                        Ver Historial de Disposición
                                    </button>
                                </div>
                            )}

                             {/* 3. GENERADOR ACTIONS (Self view) */}
                             {currentUserRole === 'GENERADOR' && isSelected && (
                                <div style={{marginTop: '12px'}}>
                                    <div style={styles.sectionTitle}>Mi Configuración de {econ.type === 'COSTO' ? 'Servicio' : 'Venta'}</div>
                                    <div style={styles.calcRow}>
                                        <span>Precio:</span>
                                        <input type="number" defaultValue={entity.pricePerUnit} style={{width: '60px'}} disabled={econ.type === 'GRATIS'} />
                                    </div>
                                    {econ.type === 'INGRESO' && (
                                        <div style={{fontSize: '11px', color: '#666', fontStyle: 'italic'}}>
                                            Tip: Únete con vecinos para subir el precio base un 5%.
                                        </div>
                                    )}
                                    
                                    {/* Sección "Etiqueta de Productor" - Manual o N/A */}
                                    <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #ddd'}}>
                                        <div style={{fontSize: '12px', fontWeight: 600, marginBottom: '8px'}}>Identificación de Origen</div>
                                        
                                        <div style={{display: 'flex', gap: '12px', marginBottom: '8px'}}>
                                            <label style={{fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'}}>
                                                <input 
                                                    type="radio" 
                                                    name="pMode" 
                                                    checked={producerMode === 'MANUAL'} 
                                                    onChange={() => setProducerMode('MANUAL')}
                                                /> Manual
                                            </label>
                                            <label style={{fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'}}>
                                                <input 
                                                    type="radio" 
                                                    name="pMode" 
                                                    checked={producerMode === 'NA'} 
                                                    onChange={() => setProducerMode('NA')}
                                                /> No Aplica
                                            </label>
                                        </div>

                                        {producerMode === 'MANUAL' && (
                                            <input 
                                                type="text" 
                                                placeholder="Nombre del Productor / Origen" 
                                                value={producerName}
                                                onChange={(e) => setProducerName(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px', 
                                                    fontSize: '12px', 
                                                    border: '1px solid #ddd', 
                                                    borderRadius: '6px',
                                                    boxSizing: 'border-box'
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                             )}

                        </div>
                    );
                })}

                {filteredEntities.length === 0 && (
                    <div style={{padding: '20px', textAlign: 'center', color: '#999'}}>
                        No hay entidades en esta categoría.
                    </div>
                )}
            </div>
        </aside>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
