// macOS descriptor-relative primitives. No path with slash is accepted by *at calls.
#include <node_api.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
static napi_value err(napi_env e,const char *msg){napi_value m,x,c; napi_create_string_utf8(e,msg,NAPI_AUTO_LENGTH,&m);napi_create_error(e,NULL,m,&x);const char *s=errno==ENOENT?"ENOENT":errno==EEXIST?"EEXIST":errno==ENOSPC?"ENOSPC":errno==EWOULDBLOCK?"EWOULDBLOCK":"PINNED_IO";napi_create_string_utf8(e,s,NAPI_AUTO_LENGTH,&c);napi_set_named_property(e,x,"code",c);napi_throw(e,x);return NULL;}
static napi_value num(napi_env e,int n){napi_value r;napi_create_int32(e,n,&r);return r;}
static int args(napi_env e,napi_callback_info i,napi_value *v,size_t n){size_t z=n;if(napi_get_cb_info(e,i,&z,v,NULL,NULL)!=napi_ok||z!=n){errno=EINVAL;err(e,"arguments");return 0;}return 1;}
static int integer(napi_env e,napi_value v){int32_t n;if(napi_get_value_int32(e,v,&n)!=napi_ok){errno=EINVAL;err(e,"integer");return -1;}return n;}
static int leaf(napi_env e,napi_value v,char *s){size_t n=0;if(napi_get_value_string_utf8(e,v,s,256,&n)!=napi_ok||!n||n>=255||strlen(s)!=n||strchr(s,'/')||!strcmp(s,".")||!strcmp(s,"..")){errno=EINVAL;err(e,"unsafe-leaf");return 0;}return 1;}
static napi_value root(napi_env e,napi_callback_info i){(void)i;int f=open("/",O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);return f<0?err(e,"root-open"):num(e,f);}
static napi_value op(napi_env e,napi_callback_info i){napi_value v[3];char n[256];if(!args(e,i,v,3)||!leaf(e,v[1],n))return NULL;int f=openat(integer(e,v[0]),n,integer(e,v[2])|O_NOFOLLOW|O_CLOEXEC|O_NONBLOCK,0600);return f<0?err(e,"openat"):num(e,f);}
static napi_value mk(napi_env e,napi_callback_info i){napi_value v[2];char n[256];if(!args(e,i,v,2)||!leaf(e,v[1],n))return NULL;if(mkdirat(integer(e,v[0]),n,0700)<0)return err(e,"mkdirat");return num(e,0);}
static napi_value rn(napi_env e,napi_callback_info i){napi_value v[3];char a[256],b[256];if(!args(e,i,v,3)||!leaf(e,v[1],a)||!leaf(e,v[2],b))return NULL;if(renameat(integer(e,v[0]),a,integer(e,v[0]),b)<0)return err(e,"renameat");return num(e,0);}
static napi_value un(napi_env e,napi_callback_info i){napi_value v[2];char n[256];if(!args(e,i,v,2)||!leaf(e,v[1],n))return NULL;if(unlinkat(integer(e,v[0]),n,0)<0)return err(e,"unlinkat");return num(e,0);}
static napi_value lock(napi_env e,napi_callback_info i){napi_value v[1];if(!args(e,i,v,1))return NULL;if(flock(integer(e,v[0]),LOCK_EX|LOCK_NB)<0)return err(e,"host-already-locked");return num(e,0);}
static napi_value syncfd(napi_env e,napi_callback_info i){napi_value v[1];if(!args(e,i,v,1))return NULL;int fd=integer(e,v[0]);struct stat st;if(fstat(fd,&st)<0||fsync(fd)<0)return err(e,"fsync");if(S_ISREG(st.st_mode)&&fcntl(fd,F_FULLFSYNC)<0)return err(e,"fullfsync");return num(e,0);}
static void str(napi_env e,napi_value o,const char*k,const char*v){napi_value x;napi_create_string_utf8(e,v,NAPI_AUTO_LENGTH,&x);napi_set_named_property(e,o,k,x);}
static napi_value info(napi_env e,napi_callback_info i){napi_value v[1],o;if(!args(e,i,v,1))return NULL;struct statfs s;if(fstatfs(integer(e,v[0]),&s)<0)return err(e,"fstatfs");napi_create_object(e,&o);char b[100];snprintf(b,sizeof b,"%d:%d",s.f_fsid.val[0],s.f_fsid.val[1]);str(e,o,"fsid",b);str(e,o,"mount",s.f_mntonname);str(e,o,"type",s.f_fstypename);snprintf(b,sizeof b,"%llu",(unsigned long long)s.f_bavail);str(e,o,"bavail",b);snprintf(b,sizeof b,"%u",s.f_bsize);str(e,o,"bsize",b);return o;}
static napi_value init(napi_env e,napi_value exports){struct{const char*n;napi_callback f;}a[]={{"root",root},{"openat",op},{"mkdirat",mk},{"renameat",rn},{"unlinkat",un},{"lock",lock},{"sync",syncfd},{"info",info}};for(size_t j=0;j<sizeof a/sizeof a[0];j++){napi_value f;napi_create_function(e,a[j].n,NAPI_AUTO_LENGTH,a[j].f,NULL,&f);napi_set_named_property(e,exports,a[j].n,f);}return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
