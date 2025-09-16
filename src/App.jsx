import React, { useState, useEffect, useRef } from 'react';
import { Upload, PlayCircle, Download, Clock, CheckCircle, XCircle, FileText, User, Settings } from 'lucide-react';

const API_BASE_URL = 'https://server-marriott.onrender.com';

function App() {
  const [tipo, setTipo] = useState('express');
  const [afiliador, setAfiliador] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  
  const logsEndRef = useRef(null);
  const intervalRef = useRef(null);

  // Auto-scroll logs al final
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [logs]);

  // Cleanup interval cuando el componente se desmonta
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validar tipo de archivo
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ];
      
      if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
        setError('Por favor selecciona un archivo Excel válido (.xlsx o .xls)');
        return;
      }
      
      setArchivo(file);
      setError(null);
    }
  };

  const agregarLog = (mensaje, tipo = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      mensaje,
      tipo
    };
    setLogs(prev => [...prev, logEntry]);
  };

  const consultarEstado = async (taskId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/status/${taskId}`);
      
      if (!response.ok) {
        throw new Error('Error consultando estado');
      }
      
      const status = await response.json();
      setTaskStatus(status);

      // Agregar logs nuevos
      if (status.logs && Array.isArray(status.logs)) {
        status.logs.forEach(log => {
          // Evitar duplicados comparando timestamp + contenido
          const logExists = logs.some(existingLog => 
            existingLog.mensaje === log || existingLog.mensaje.includes(log.split('] ')[1] || log)
          );
          
          if (!logExists) {
            const cleanLog = log.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
            let tipoLog = 'info';
            
            if (cleanLog.includes('✅') || cleanLog.includes('ÉXITO')) tipoLog = 'success';
            else if (cleanLog.includes('❌') || cleanLog.includes('ERROR')) tipoLog = 'error';
            else if (cleanLog.includes('⚠️') || cleanLog.includes('WARNING')) tipoLog = 'warning';
            
            agregarLog(cleanLog, tipoLog);
          }
        });
      }

      // Si el proceso terminó
      if (status.status === 'completed') {
        agregarLog(`🎉 Proceso completado! ${status.successful_records} exitosos, ${status.error_records} errores`, 'success');
        
        if (status.result_file_url) {
          const filename = status.result_file_url.split('/').pop();
          setDownloadUrl(`${API_BASE_URL}/download/${filename}`);
        }
        
        // Detener polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        setProcesando(false);
      } else if (status.status === 'error') {
        agregarLog(`🚨 Error en el proceso: ${status.message}`, 'error');
        
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        setProcesando(false);
        setError(status.message);
      }

    } catch (error) {
      console.error('Error consultando estado:', error);
      agregarLog(`Error consultando estado: ${error.message}`, 'error');
    }
  };

  const procesarExcel = async () => {
    if (!archivo) {
      setError('Debes seleccionar un archivo Excel');
      return;
    }
    
    if (!afiliador.trim()) {
      setError('Debes ingresar el nombre del afiliador');
      return;
    }

    // Reset estado
    setError(null);
    setLogs([]);
    setTaskStatus(null);
    setDownloadUrl(null);
    setProcesando(true);

    const formData = new FormData();
    formData.append('archivo_excel', archivo);
    formData.append('tipo_afiliacion', tipo);
    formData.append('nombre_afiliador', afiliador.trim());

    try {
      agregarLog('📤 Subiendo archivo y iniciando proceso...', 'info');
      
      const response = await fetch(`${API_BASE_URL}/procesar`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al procesar archivo');
      }

      const data = await response.json();
      
      if (!data.task_id) {
        throw new Error('No se recibió ID de tarea');
      }

      setTaskId(data.task_id);
      agregarLog(`✅ Proceso iniciado! Task ID: ${data.task_id}`, 'success');
      agregarLog(`📊 Total de registros: ${data.total_records}`, 'info');
      agregarLog(`⏱️ Tiempo estimado: ${Math.ceil(data.estimated_time_minutes)} minutos`, 'info');

      // Iniciar polling cada 3 segundos
      intervalRef.current = setInterval(() => {
        consultarEstado(data.task_id);
      }, 3000);

      // Primera consulta inmediata
      setTimeout(() => consultarEstado(data.task_id), 1000);

    } catch (error) {
      console.error('Error:', error);
      setError(`Error al iniciar proceso: ${error.message}`);
      setProcesando(false);
      agregarLog(`🚨 Error: ${error.message}`, 'error');
    }
  };

  const detenerProceso = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setProcesando(false);
    agregarLog('🛑 Monitoreo detenido manualmente', 'warning');
  };

  const getLogIcon = (tipo) => {
    switch(tipo) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return '📝';
    }
  };

  const getLogColor = (tipo) => {
    switch(tipo) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Automatización Marriott Bonvoy
          </h1>
          <p className="text-blue-200">
            Procesa afiliaciones automáticamente desde archivos Excel
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Panel de Control */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center mb-6">
              <Settings className="w-6 h-6 text-blue-300 mr-2" />
              <h2 className="text-xl font-semibold text-white">Panel de Control</h2>
            </div>

            <div className="space-y-6">
              {/* Tipo de Afiliación */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Tipo de Afiliación
                </label>
                <select
                  className="w-full bg-white/10 border border-white/30 rounded-lg p-3 text-white placeholder-white/60 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  disabled={procesando}
                >
                  <option value="express" className="text-black">Express</option>
                  <option value="junior" className="text-black">Junior Suite</option>
                </select>
              </div>

              {/* Nombre del Afiliador */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  <User className="w-4 h-4 inline mr-1" />
                  Nombre del Afiliador
                </label>
                <input
                  type="text"
                  className="w-full bg-white/10 border border-white/30 rounded-lg p-3 text-white placeholder-white/60 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  placeholder="Ingresa tu nombre completo"
                  value={afiliador}
                  onChange={(e) => setAfiliador(e.target.value)}
                  disabled={procesando}
                />
              </div>

              {/* Archivo Excel */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Archivo Excel (.xlsx, .xls)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    disabled={procesando}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex items-center justify-center w-full p-4 border-2 border-dashed border-white/30 rounded-lg cursor-pointer hover:border-white/50 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-white mr-2" />
                    <span className="text-white">
                      {archivo ? archivo.name : 'Seleccionar archivo Excel'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                  <div className="flex items-center">
                    <XCircle className="w-5 h-5 text-red-400 mr-2" />
                    <span className="text-red-200 text-sm">{error}</span>
                  </div>
                </div>
              )}

              {/* Botones */}
              <div className="flex space-x-3">
                <button
                  onClick={procesarExcel}
                  disabled={procesando || !archivo || !afiliador.trim()}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                >
                  {procesando ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 mr-2" />
                      Iniciar Proceso
                    </>
                  )}
                </button>

                {procesando && (
                  <button
                    onClick={detenerProceso}
                    className="bg-red-500 hover:bg-red-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
                  >
                    Detener
                  </button>
                )}
              </div>

              {/* Estado del Proceso */}
              {taskStatus && (
                <div className="bg-black/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">Estado del Proceso</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      taskStatus.status === 'completed' ? 'bg-green-500 text-white' :
                      taskStatus.status === 'error' ? 'bg-red-500 text-white' :
                      taskStatus.status === 'processing' ? 'bg-blue-500 text-white' :
                      'bg-yellow-500 text-black'
                    }`}>
                      {taskStatus.status.toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Barra de Progreso */}
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${taskStatus.progress}%` }}
                    ></div>
                  </div>
                  
                  {/* Estadísticas */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-white/60">Procesados</div>
                      <div className="text-white font-medium">{taskStatus.processed_records}/{taskStatus.total_records}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-white/60">Exitosos</div>
                      <div className="text-green-400 font-medium">{taskStatus.successful_records}</div>
                    </div>
                  </div>
                  
                  {taskStatus.current_processing && taskStatus.status === 'processing' && (
                    <div className="text-xs text-white/80">
                      <span className="text-white/60">Procesando:</span> {taskStatus.current_processing}
                    </div>
                  )}
                </div>
              )}

              {/* Descarga */}
              {downloadUrl && (
                <div className="text-center">
                  <a
                    href={downloadUrl}
                    className="inline-flex items-center bg-green-500 hover:bg-green-600 text-white py-3 px-6 rounded-lg font-medium transition-colors"
                    download
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Resultados
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Panel de Logs */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center mb-4">
              <FileText className="w-6 h-6 text-green-400 mr-2" />
              <h2 className="text-xl font-semibold text-white">Logs en Tiempo Real</h2>
              {logs.length > 0 && (
                <span className="ml-auto bg-white/20 text-white text-xs px-2 py-1 rounded-full">
                  {logs.length}
                </span>
              )}
            </div>

            <div className="bg-gray-900/50 rounded-lg h-96 overflow-y-auto p-4 font-mono text-sm">
              {logs.length === 0 ? (
                <div className="text-gray-400 text-center py-8">
                  Los logs aparecerán aquí durante el procesamiento...
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="mb-1 flex items-start space-x-2">
                    <span className="text-gray-500 text-xs mt-1 flex-shrink-0">
                      {log.timestamp}
                    </span>
                    <span className="flex-shrink-0">
                      {getLogIcon(log.tipo)}
                    </span>
                    <span className={`${getLogColor(log.tipo)} break-words`}>
                      {log.mensaje}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;