import { call, put, select, take } from 'redux-saga/effects';
import { normalize, schema } from "normalizr";
import { HTTP_METHOD } from "src/common";
import { action, getSSRDataInfo, setAllDataAC } from 'redux/store/actions';
import next from '../../next.config';
import { camelizeKeys } from 'humps';
import saga from 'redux/decorators/saga';
import { table } from 'console';

export default class Entity {
  private schema; 
  private entityName:string;
  public static actions: any = [];
  private className;

  constructor(name: string= null,definition: any = {}, options: any = {}) {
    if (name !== null) this.schema = new schema.Entity(name, definition, options);
    this.entityName = name;
    this.className = this.constructor.name;
    this.xFetch = this.xFetch.bind(this);
    this.actionRequest = this.actionRequest.bind(this);
    this.xRead = this.xRead.bind(this);
    this.xSave = this.xSave.bind(this);
    this.normalize = this.normalize.bind(this)
    
    Entity.addAction = Entity.addAction.bind(this);
    Entity.getActions = Entity.getActions.bind(this);
  }

  public getSchema() {
    return this.schema;
  }
  public getEntityName() {
    return this.entityName;
  }

  public static addAction(saga) {
    Entity.actions.push(saga);
  }

  public static getActions(actionName: string = null) {
    return Entity.actions;
  }

  public getListAction(action) {
    return Entity.getActions()[this.className][action].decoratorFunction;
  }

  protected xFetch(endpoint: string, method: HTTP_METHOD, data = {}, token?: string){
    let fullUrl = next.baseUrl + '/api' + endpoint; 

    const params: any = {
      method,
      credentials: 'include',
      headers: {
        Authorization: 'bearer ' + token, // get token from cookies
      },
    };

    if (method !== HTTP_METHOD.GET) {
      params['headers']['content-type'] = 'application/json';
      params['body'] = JSON.stringify(data);

    } else {
      const opts = Object.entries(data).map(([key, val]) => key + '=' + val).join('&');
      fullUrl += (opts.length > 0 ? '?' + opts : '');
    }

    return fetch(fullUrl, params)
      .then((response) => {
        return response.json().then((json) => ({ json, response }));
      })
      .then(({ json, response }) =>
        Promise.resolve({
          success: response.ok ? true : false,
          response: json
        })
      );
  }

  public * actionRequest(endpoint?: string, method?: HTTP_METHOD, data?: any, token?: string ) {
    let ssrDataQuery = yield select((state) => state.ssrDataReducer)
    


    let ssrData = yield select((state) => state.ssrDataReducer);
    if (ssrData && Object.keys(ssrData).length !== 0) {
      for (const [key, value] of Object.entries(ssrData)) {
        yield call(this.normalize, value);
      }
      yield put(getSSRDataInfo({}));
    } else {
      const result = yield call(this.xFetch, endpoint, method, data, token);
      if (result.success === true && result.response.error === false && this.schema) { 
        yield call(this.normalize, result.response.data); 
      }
      else { return result }
    }
  }

  public *normalize(dataNew) {
    const schema = (Array.isArray(dataNew) ? [this.schema] : this.schema)
    if (this.schema) {
      const normalizedData = normalize(camelizeKeys(JSON.parse(JSON.stringify(dataNew))), schema);
      return yield put(setAllDataAC(this.getEntityName(), normalizedData))
    }
  }

  public xSave(point: string, data: any = {}){
    return this.actionRequest(point, HTTP_METHOD.POST, data);
  }

  public xRead(point: string, data: any = {}, method: HTTP_METHOD = HTTP_METHOD.GET){
    return this.actionRequest(point, method, data);
  }

  public xDelete(point: string, data: any = {}){
    return this.actionRequest(point, HTTP_METHOD.DELETE, data);
  }
}