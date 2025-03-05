import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const { useState, useEffect, useRef, useMemo } = React;
const { createRoot } = ReactDOM;
const { useSyncExternalStore } = React;

// Main App Component
function App() {
  const [activeView, setActiveView] = useState('gallery'); // 'gallery' or 'create'
  const [selectedPlanet, setSelectedPlanet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const room = useRef(new WebsimSocket());
  
  const planets = useSyncExternalStore(
    room.current.collection('planet').subscribe,
    room.current.collection('planet').getList
  );

  const username = room.current.party.client.username;

  const toggleView = () => {
    setActiveView(prev => prev === 'gallery' ? 'create' : 'gallery');
  };

  const viewPlanet = (planet) => {
    setSelectedPlanet(planet);
  };

  const closeModal = () => {
    setSelectedPlanet(null);
  };

  return (
    <div className="app-container">
      <PlanetScene planets={planets} selectedPlanet={selectedPlanet} />
      
      <div className="ui-container">
        <header className="header">
          <h1>This 3D Planet Does Not Exist</h1>
        </header>
        
        {activeView === 'create' && (
          <PlanetCreator 
            room={room.current} 
            setLoading={setLoading} 
            setLoadingMessage={setLoadingMessage}
            username={username}
            toggleView={toggleView}
          />
        )}
        
        {activeView === 'gallery' && (
          <PlanetGallery 
            planets={planets} 
            viewPlanet={viewPlanet}
          />
        )}
      </div>
      
      <button className="toggle-view-button" onClick={toggleView}>
        {activeView === 'gallery' ? (
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
        )}
      </button>
      
      {selectedPlanet && (
        <PlanetModal planet={selectedPlanet} closeModal={closeModal} />
      )}
      
      {loading && (
        <LoadingOverlay message={loadingMessage} />
      )}
    </div>
  );
}

// Loading component with dynamic messages
function LoadingOverlay({ message }) {
  return (
    <div className="loading-overlay">
      <div className="loading-spinner"></div>
      <p className="loading-text">{message || 'Loading...'}</p>
    </div>
  );
}

// Planet Creator Form
function PlanetCreator({ room, setLoading, setLoadingMessage, username, toggleView }) {
  const [planetName, setPlanetName] = useState('');
  const [planetDesc, setPlanetDesc] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (generating) return;
    if (!planetName.trim()) return;
    
    setGenerating(true);
    setLoading(true);
    
    try {
      // Step 1: Generate detailed planet description using LLM
      setLoadingMessage('Generating planet description...');
      const planetDescription = await generatePlanetDescription(planetName, planetDesc);
      
      // Step 2: Generate planet image using the description
      setLoadingMessage('Creating planet image based on description...');
      const imageResult = await generatePlanetImage(planetName, planetDescription);
      
      // Step 3: Save planet to database
      setLoadingMessage('Saving your planet...');
      await room.collection('planet').create({
        name: planetName,
        description: planetDescription,
        imageUrl: imageResult.url,
        creator: username,
        createdAt: new Date().toISOString()
      });
      
      // Reset form
      setPlanetName('');
      setPlanetDesc('');
      toggleView(); // Switch to gallery view to see the new planet
      
    } catch (error) {
      console.error('Error creating planet:', error);
      alert('Failed to create planet. Please try again.');
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };
  
  // Helper function to generate detailed planet description using LLM
  const generatePlanetDescription = async (name, userDesc) => {
    const prompt = `Create a detailed and imaginative description for a fictional planet named "${name}"${userDesc ? ` with these characteristics: ${userDesc}` : ''}. 
    Include information about its atmosphere, terrain, geology, climate, any unique features, possible life forms, and interesting astronomical details.
    Make it scientifically plausible but also creative and distinctive. Write approximately 200-300 words.`;
    
    const completion = await websim.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an expert science fiction writer and planetary scientist. Create vivid and scientifically plausible descriptions of fictional planets."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });
    
    return completion.content;
  };
  
  // Helper function to generate planet image using the description
  const generatePlanetImage = async (name, description) => {
    const prompt = `A photorealistic spherical planet viewed from space named ${name}. ${description.substring(0, 300)}. High detail texture, no stars in background, just the planet sphere.`;
    
    return await websim.imageGen({
      prompt: prompt,
      aspect_ratio: "1:1",
    });
  };

  return (
    <div className="planet-generator">
      <h2>Create New Planet</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="planet-name">Planet Name</label>
          <input 
            type="text"
            id="planet-name"
            value={planetName}
            onChange={(e) => setPlanetName(e.target.value)}
            placeholder="Enter a name for your planet"
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="planet-desc">Desired Characteristics (Optional)</label>
          <textarea 
            id="planet-desc"
            value={planetDesc}
            onChange={(e) => setPlanetDesc(e.target.value)}
            placeholder="Describe any specific features you want (e.g., rings, water oceans, desert landscape, etc.)"
          />
        </div>
        
        <button 
          type="submit" 
          className="generate-button"
          disabled={generating || !planetName.trim()}
        >
          {generating ? 'Generating...' : 'Generate Planet'}
        </button>
      </form>
    </div>
  );
}

// Planet Gallery
function PlanetGallery({ planets, viewPlanet }) {
  const sortedPlanets = [...planets].reverse(); // Show newest first
  
  return (
    <div className="planet-gallery">
      {sortedPlanets.length === 0 ? (
        <p>No planets yet. Be the first to create one!</p>
      ) : (
        sortedPlanets.map(planet => (
          <div key={planet.id} className="planet-card" onClick={() => viewPlanet(planet)}>
            <div className="planet-image" style={{ backgroundImage: `url(${planet.imageUrl})` }}></div>
            <div className="planet-details">
              <h3 className="planet-name">{planet.name}</h3>
              <p className="planet-author">Created by {planet.creator || 'Unknown'}</p>
              <p className="planet-description">{planet.description.substring(0, 150)}...</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Planet Modal for detailed view
function PlanetModal({ planet, closeModal }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [closeModal]);

  return (
    <div className="planet-modal" onClick={closeModal}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="close-modal" onClick={closeModal}>×</button>
        <h2 className="modal-planet-name">{planet.name}</h2>
        <p className="modal-planet-author">Created by {planet.creator || 'Unknown'}</p>
        <p className="modal-planet-description">{planet.description}</p>
        <img className="modal-planet-image" src={planet.imageUrl} alt={planet.name} />
      </div>
    </div>
  );
}

// 3D Planet Scene
function PlanetScene({ planets, selectedPlanet }) {
  const containerRef = useRef();
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const planetMeshRef = useRef(null);
  
  // Keeps track of the current planet being displayed in 3D
  const [activePlanetId, setActivePlanetId] = useState(null);
  const [textureLoading, setTextureLoading] = useState(false);

  // Setup the 3D scene
  useEffect(() => {
    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 3;
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Add controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controlsRef.current = controls;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);
    
    // Create base planet
    createBasePlanet();
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (planetMeshRef.current) {
        planetMeshRef.current.rotation.y += 0.001;
      }
      
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    
    // Handle window resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);
  
  // Create the base planet
  const createBasePlanet = () => {
    if (sceneRef.current) {
      // Remove previous planet if it exists
      if (planetMeshRef.current) {
        sceneRef.current.remove(planetMeshRef.current);
      }
      
      // Create planet geometry
      const geometry = new THREE.SphereGeometry(1, 64, 64);
      
      // Create default material with bluish color
      const material = new THREE.MeshStandardMaterial({
        color: 0x1e3799,
        roughness: 0.7,
        metalness: 0.2,
      });
      
      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);
      sceneRef.current.add(mesh);
      planetMeshRef.current = mesh;
    }
  };
  
  // Update planet texture when a new planet is selected
  useEffect(() => {
    if (!selectedPlanet) {
      // When no planet is selected, try to display the most recent one
      if (planets.length > 0 && activePlanetId !== planets[0].id) {
        updatePlanetTexture(planets[0]);
      }
      return;
    }
    
    // Update to the selected planet if it's different from current
    if (selectedPlanet.id !== activePlanetId) {
      updatePlanetTexture(selectedPlanet);
    }
  }, [selectedPlanet, planets, activePlanetId]);
  
  // Function to update the planet texture with cors fallback
  const updatePlanetTexture = async (planet) => {
    if (!planet || !planet.imageUrl || !planetMeshRef.current) return;
    
    setTextureLoading(true);
    
    // Try to load the texture directly
    try {
      const textureLoader = new THREE.TextureLoader();
      
      // Promise-based texture loading
      const loadTexture = (url) => {
        return new Promise((resolve, reject) => {
          textureLoader.load(
            url,
            (texture) => resolve(texture),
            undefined,
            (err) => reject(err)
          );
        });
      };
      
      // First try with direct URL
      try {
        const texture = await loadTexture(planet.imageUrl);
        applyTexture(texture, planet);
      } catch (directError) {
        console.warn('Direct texture loading failed, trying CORS proxy:', directError);
        
        // Try with CORS proxy
        try {
          const corsProxyUrl = `https://cors-anywhere.herokuapp.com/${planet.imageUrl}`;
          const texture = await loadTexture(corsProxyUrl);
          applyTexture(texture, planet);
        } catch (corsError) {
          console.error('CORS proxy failed too:', corsError);
          
          // Apply a fallback colored material
          const material = new THREE.MeshStandardMaterial({
            color: stringToColor(planet.name),
            roughness: 0.7,
            metalness: 0.3,
          });
          
          if (planetMeshRef.current) {
            planetMeshRef.current.material = material;
          }
        }
      }
    } catch (error) {
      console.error('Error applying planet texture:', error);
    } finally {
      setTextureLoading(false);
      setActivePlanetId(planet.id);
    }
  };
  
  // Apply the loaded texture to the planet
  const applyTexture = (texture, planet) => {
    if (!planetMeshRef.current) return;
    
    // Apply texture to the material
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.7,
      metalness: 0.2,
    });
    
    planetMeshRef.current.material = material;
  };
  
  // Utility to generate a color from a string
  const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const c = (hash & 0x00FFFFFF)
      .toString(16)
      .toUpperCase();
    
    return parseInt(`0x${c.padStart(6, '0')}`);
  };
  
  return (
    <div className="planet-scene" ref={containerRef}>
      {textureLoading && <div className="loading-spinner" style={{ position: 'absolute', top: '10px', right: '10px' }}></div>}
    </div>
  );
}

// Render the app
const root = createRoot(document.getElementById('root'));
root.render(<App />);

